import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { getDb } from './db'

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
    const rows = getDb()
      .prepare("SELECT * FROM detections WHERE LOWER(ownerWallet) = ? AND status NOT IN ('pending', 'no_match')")
      .all(wallet.toLowerCase())
    res.json(rows)
  })

  // Returns DMCA enforcement actions for photos owned by a given wallet
  app.get('/api/disputes', (req, res) => {
    const wallet = req.query.wallet as string | undefined
    if (!wallet) { res.status(400).json({ error: 'wallet query param required' }); return }
    const rows = getDb()
      .prepare("SELECT * FROM detections WHERE LOWER(ownerWallet) = ? AND status = 'dmca_sent' ORDER BY createdAt DESC")
      .all(wallet.toLowerCase())
    res.json(rows)
  })

  // Requeue a detection for payment retry (resets dmca_sent → verified)
  app.post('/api/detections/:id/requeue', (req, res) => {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'invalid id' }); return }
    const result = getDb()
      .prepare("UPDATE detections SET status = 'verified', dmcaSentAt = NULL WHERE id = ? AND status = 'dmca_sent'")
      .run(id)
    if (result.changes === 0) { res.status(404).json({ error: 'not found or not requeue-able' }); return }
    res.json({ ok: true })
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
