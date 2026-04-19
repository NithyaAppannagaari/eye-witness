import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import { ethers } from 'ethers'
import fs from 'fs'
import { getDb } from './db'
import { resolveDisputeOnChain } from './dispute'
import { generateWithdrawalNotice, sendNotice } from './dmca'
import { logger } from './logger'

const LICENSE_ENGINE_ABI_PATH = path.resolve(__dirname, '../../frontend/src/abi/LicenseEngine.json')
const DISPUTE_REGISTRY_ABI_PATH = path.resolve(__dirname, '../../frontend/src/abi/DisputeRegistry.json')

export function startListener(): void {
  const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL
  const licenseEngineAddress = process.env.NEXT_PUBLIC_LICENSE_ENGINE_ADDRESS
  const disputeRegistryAddress = process.env.NEXT_PUBLIC_DISPUTE_REGISTRY_ADDRESS

  if (!rpcUrl || !licenseEngineAddress || !disputeRegistryAddress) {
    console.warn('[listener] Missing env vars — skipping listener startup')
    return
  }

  // Prefer WebSocket for real-time events; fall back to HTTP polling
  const wsUrl = rpcUrl.replace(/^https/, 'wss').replace(/^http/, 'ws')
  let provider: ethers.Provider

  try {
    provider = new ethers.WebSocketProvider(wsUrl)
    logger.info('[listener] Connected via WebSocket')
  } catch {
    provider = new ethers.JsonRpcProvider(rpcUrl)
    logger.info('[listener] Falling back to HTTP polling provider')
  }

  const leAbi = JSON.parse(fs.readFileSync(LICENSE_ENGINE_ABI_PATH, 'utf-8')).abi
  const drAbi = JSON.parse(fs.readFileSync(DISPUTE_REGISTRY_ABI_PATH, 'utf-8')).abi

  const licenseEngine = new ethers.Contract(licenseEngineAddress, leAbi, provider)
  const disputeRegistry = new ethers.Contract(disputeRegistryAddress, drAbi, provider)

  // When a license is minted for a photo that has an open dispute, auto-resolve it
  // and send a DMCA withdrawal notice to the hosting provider
  licenseEngine.on('LicenseMinted', async (photoId: string, _publisher: string, _useType: string, _amount: bigint, url: string) => {
    logger.info(`[listener] LicenseMinted — photoId=${photoId} url=${url}`)
    try {
      const db = getDb()
      const row = db
        .prepare("SELECT id, disputeId, pageUrl, dmcaEmail, ownerWallet FROM detections WHERE matchedPhotoHash = ? AND disputeId IS NOT NULL AND status = 'dmca_sent'")
        .get(photoId) as { id: number; disputeId: number; pageUrl: string; dmcaEmail: string | null; ownerWallet: string | null } | undefined

      if (row?.disputeId != null) {
        await resolveDisputeOnChain(row.disputeId)
        db.prepare("UPDATE detections SET status = 'resolved', resolvedAt = datetime('now') WHERE id = ?").run(row.id)
        logger.info(`[listener] Auto-resolved dispute ${row.disputeId} after LicenseMinted`)

        // Send withdrawal notice to the hosting provider
        if (row.dmcaEmail && row.ownerWallet) {
          const notice = generateWithdrawalNotice({
            photoHash: photoId,
            pageUrl: row.pageUrl,
            ownerWallet: row.ownerWallet,
          })
          await sendNotice(row.dmcaEmail, notice, photoId)
          logger.info(`[listener] Withdrawal notice sent to ${row.dmcaEmail}`)
        }
      }
    } catch (err) {
      logger.warn({ err }, '[listener] Auto-resolve failed')
    }
  })

  disputeRegistry.on('DisputeResolved', (disputeId: bigint, photoId: string) => {
    logger.info(`[listener] DisputeResolved on-chain — disputeId=${disputeId} photoId=${photoId}`)
  })

  logger.info('[listener] Watching LicenseMinted + DisputeResolved events')
}
