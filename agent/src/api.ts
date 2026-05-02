import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import {
  getDb,
  getDetectionsByWallet,
  getDisputesByWallet,
  serializeDetection,
  getLedgerByPublisher,
  getLedgerByPhotographer,
  getEarningsByPhotographer,
  getRegisteredPhotosByOwner,
  serializeLedgerEntry,
  getLastSyncedBlock,
  getLastLedgerBlock,
  updateDetection,
} from './db'
import { ethers } from 'ethers'
import { getLicenseRules } from './registry'
import { classifyUseByUrl } from './classifier'
import {
  getPublisherForDomain,
  getPublisherBalance,
  executePayment,
  isAlreadyChargedOnChain,
} from './payment'
import { DetectionRow } from './types'

let _statusProvider: ethers.JsonRpcProvider | null = null
function getStatusProvider(): ethers.JsonRpcProvider {
  if (_statusProvider) return _statusProvider
  const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL
  if (!rpcUrl) throw new Error('NEXT_PUBLIC_BASE_RPC_URL not set')
  _statusProvider = new ethers.JsonRpcProvider(rpcUrl, undefined, { batchMaxCount: 1 })
  return _statusProvider
}

const PORT = 3001
const TARGETS_PATH = path.resolve(__dirname, '../targets.json')

function readTargets(): string[] {
  try { return JSON.parse(fs.readFileSync(TARGETS_PATH, 'utf-8')) as string[] } catch { return [] }
}

function writeTargets(targets: string[]): void {
  fs.writeFileSync(TARGETS_PATH, JSON.stringify(targets, null, 2))
}

export function startApiServer(): void {
  const app = express()
  app.use(cors({ origin: 'http://localhost:3000' }))
  app.use(express.json())

  // Returns all detections for photos owned by a given wallet
  app.get('/api/detections', (req, res) => {
    const wallet = req.query.wallet as string | undefined
    if (!wallet) { res.status(400).json({ error: 'wallet query param required' }); return }
    res.json(getDetectionsByWallet(wallet).map(serializeDetection))
  })

  // Returns DMCA enforcement actions for photos owned by a given wallet
  app.get('/api/disputes', (req, res) => {
    const wallet = req.query.wallet as string | undefined
    if (!wallet) { res.status(400).json({ error: 'wallet query param required' }); return }
    res.json(getDisputesByWallet(wallet).map(serializeDetection))
  })

  // Escrow ledger: every on-chain PaymentDrawn event the agent has indexed.
  // Filterable by either side of the transaction. Returns entries newest-first.
  app.get('/api/ledger', (req, res) => {
    const publisher = req.query.publisher as string | undefined
    const photographer = req.query.photographer as string | undefined
    if (!publisher && !photographer) {
      res.status(400).json({ error: 'publisher or photographer query param required' })
      return
    }
    const rows = publisher ? getLedgerByPublisher(publisher) : getLedgerByPhotographer(photographer!)
    res.json(rows.map(serializeLedgerEntry))
  })

  // Per-photographer registered photos joined with ledger aggregates: total
  // earned and detection count per photo. The photographer dashboard's primary
  // data source — replaces the per-photo on-chain getLogs() loop.
  app.get('/api/photos', (req, res) => {
    const owner = req.query.owner as string | undefined
    if (!owner) { res.status(400).json({ error: 'owner query param required' }); return }
    const photos = getRegisteredPhotosByOwner(owner)
    const earnings = getEarningsByPhotographer(owner)
    const photographerCutBps = 8500n
    res.json(photos.map(p => {
      const stats = earnings.get(p.photoHash) ?? { total: 0n, count: 0 }
      const photographerEarnedRaw = (stats.total * photographerCutBps) / 10_000n
      return {
        photoHash: p.photoHash,
        owner: p.owner,
        timestamp: p.timestamp.toString(),
        pHash: p.pHash,
        grossEarned: stats.total.toString(),       // total publisher payments for this photo
        photographerEarned: photographerEarnedRaw.toString(), // 85% cut, in 6-decimal USDC
        detectionCount: stats.count,
      }
    }))
  })

  // Retry payment for a detection. Looks up the publisher who claims the
  // detection's domain, checks their on-chain escrow balance, and — if it
  // covers the license price — calls EscrowVault.drawPayment immediately
  // (synchronously; returns the txHash to the caller). The contract's
  // chargedFor guard prevents double-charge if this races the pipeline tick.
  app.post('/api/detections/:id/requeue', async (req, res) => {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'invalid id' }); return }

    const raw = getDb().prepare('SELECT * FROM detections WHERE id = ?').get(id) as
      | (Omit<DetectionRow, 'licensePrice'> & { licensePrice: string | null })
      | undefined
    if (!raw) { res.status(404).json({ error: 'detection not found' }); return }

    if (raw.status === 'paying') {
      res.status(409).json({ error: 'payment already in flight' }); return
    }
    if (raw.status === 'paid' || raw.status === 'already_licensed') {
      res.status(409).json({ error: `already ${raw.status}` }); return
    }
    if (!raw.matchedPhotoHash || !raw.ownerWallet) {
      res.status(400).json({ error: 'detection has no matched photo or owner wallet' }); return
    }

    const photoHash = raw.matchedPhotoHash
    const photographer = raw.ownerWallet
    const pageUrl = raw.pageUrl
    const useType = raw.useType ?? classifyUseByUrl(pageUrl)

    let licensePrice: bigint | null = null
    try {
      const rules = await getLicenseRules(photoHash)
      const priceMap: Record<string, bigint | null> = {
        editorial: rules?.editorialPrice ?? null,
        commercial: rules?.commercialPrice ?? null,
        ai_training: rules?.aiTrainingPrice ?? null,
      }
      licensePrice = priceMap[useType] ?? null
    } catch (err) {
      res.status(502).json({ error: 'failed to read on-chain license rules', detail: err instanceof Error ? err.message : String(err) }); return
    }
    if (!licensePrice || licensePrice === 0n) {
      res.status(400).json({ error: `no license price set for use type "${useType}" on this photo` }); return
    }

    let publisherAddress: string | null = null
    try {
      const domain = new URL(pageUrl).hostname
      publisherAddress = await getPublisherForDomain(domain)
    } catch {
      res.status(400).json({ error: 'invalid page URL on detection' }); return
    }
    if (!publisherAddress) {
      res.status(400).json({ error: 'no publisher has claimed this domain' }); return
    }

    let balance: bigint
    try {
      balance = await getPublisherBalance(publisherAddress)
    } catch (err) {
      res.status(502).json({ error: 'failed to read publisher escrow balance', detail: err instanceof Error ? err.message : String(err) }); return
    }
    if (balance < licensePrice) {
      res.status(402).json({
        error: 'publisher escrow balance insufficient',
        publisher: publisherAddress,
        balance: balance.toString(),
        required: licensePrice.toString(),
      })
      return
    }

    updateDetection(id, { status: 'paying', publisherAddress, useType, licensePrice })
    try {
      const txHash = await executePayment(publisherAddress, photoHash, licensePrice, pageUrl, photographer, useType)
      updateDetection(id, { status: 'paid', txHash })
      res.json({
        ok: true,
        status: 'paid',
        txHash,
        amount: licensePrice.toString(),
        publisher: publisherAddress,
        photographer,
      })
    } catch (err) {
      // Tx may have mined despite the local error. Probe the on-chain guard
      // to avoid leaving a row stuck or rolling back a successful charge.
      try {
        if (await isAlreadyChargedOnChain(photoHash, pageUrl)) {
          updateDetection(id, { status: 'paid' })
          res.json({ ok: true, status: 'paid', reconciled: true, amount: licensePrice.toString(), publisher: publisherAddress, photographer })
          return
        }
      } catch { /* probe failed — fall through to rollback */ }
      updateDetection(id, { status: 'verified' })
      res.status(500).json({ error: 'payment transaction failed', detail: err instanceof Error ? err.message : String(err) })
    }
  })

  // Agent indexing health: how far behind the chain head are we?
  // Used by dashboards to show "Indexing… N blocks behind" instead of a
  // misleadingly-empty list when the agent is still catching up.
  app.get('/api/agent-status', async (_req, res) => {
    try {
      const latest = await getStatusProvider().getBlockNumber()
      const registry = getLastSyncedBlock()
      const ledger = getLastLedgerBlock()
      res.json({
        chainHead: latest,
        registry: {
          lastBlock: registry,
          lag: registry != null ? Math.max(0, latest - registry) : null,
        },
        ledger: {
          lastBlock: ledger,
          lag: ledger != null ? Math.max(0, latest - ledger) : null,
        },
      })
    } catch (err) {
      res.status(503).json({ error: err instanceof Error ? err.message : 'rpc unavailable' })
    }
  })

  // --- Crawl targets management ---

  app.get('/api/targets', (_req, res) => {
    res.json(readTargets())
  })

  app.post('/api/targets', (req, res) => {
    const { url } = req.body as { url?: string }
    if (!url) { res.status(400).json({ error: 'url required' }); return }
    try {
      new URL(url) // validate it's a real URL
    } catch {
      res.status(400).json({ error: 'invalid URL' }); return
    }
    const targets = readTargets()
    if (!targets.includes(url)) {
      targets.push(url)
      writeTargets(targets)
    }
    res.json({ ok: true, targets })
  })

  app.delete('/api/targets', (req, res) => {
    const { url } = req.body as { url?: string }
    if (!url) { res.status(400).json({ error: 'url required' }); return }
    const updated = readTargets().filter(t => t !== url)
    writeTargets(updated)
    res.json({ ok: true, targets: updated })
  })

  app.listen(PORT, () => {
    console.log(`[api] Detection API listening on http://localhost:${PORT}`)
  })
}
