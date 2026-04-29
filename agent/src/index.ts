import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import fs from 'fs'
import { crawlAndInsert } from './crawler'
import { syncRegisteredPhotos } from './registry'
import { processPending, processMatched, processVerified } from './pipeline'
import { startApiServer } from './api'
import { logger } from './logger'

const TARGETS_PATH = path.resolve(__dirname, '../targets.json')
const LOOP_INTERVAL_MS = 60_000

function loadTargets(): string[] {
  try {
    const targets = JSON.parse(fs.readFileSync(TARGETS_PATH, 'utf-8')) as string[]
    if (targets.length > 0) return targets
  } catch { /* file missing or empty */ }
  logger.warn('[index] targets.json is empty or missing — nothing to crawl this tick')
  return []
}

async function runLoop(): Promise<void> {
  logger.info('[index] Starting Eye:Witness agent...')

  startApiServer()

  const tick = async () => {
    logger.info(`[index] Tick at ${new Date().toISOString()}`)

    try {
      await syncRegisteredPhotos()
    } catch {
      logger.warn('[index] Registry sync skipped (RPC limit — will retry next tick)')
    }

    const targets = loadTargets()
    if (targets.length > 0) {
      await crawlAndInsert(targets)
    }

    await processPending()
    await processMatched()
    await processVerified()

    logger.info('[index] Tick complete')
  }

  await tick()

  if (process.argv.includes('--once')) {
    logger.info('[index] --once flag set, exiting after single tick')
    process.exit(0)
  }

  setInterval(tick, LOOP_INTERVAL_MS)
}

runLoop().catch(err => {
  logger.error({ err }, '[index] Fatal error')
  process.exit(1)
})
