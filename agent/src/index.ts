import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import fs from 'fs'
import { crawlAndInsert } from './crawler'
import { syncRegisteredPhotos } from './registry'
import { processPending, processMatched, processVerified, processClassified, processEnforcement } from './pipeline'
import { startApiServer } from './api'
import { startListener } from './listener'
import { startMonitor } from './monitor'
import { startHealthServer } from './health'
import { logger } from './logger'

const TARGETS_PATH = path.resolve(__dirname, '../targets.json')
const LOOP_INTERVAL_MS = 60_000

function loadTargets(): string[] {
  try {
    return JSON.parse(fs.readFileSync(TARGETS_PATH, 'utf-8')) as string[]
  } catch {
    logger.error('[index] Could not load targets.json')
    return []
  }
}

async function runLoop(): Promise<void> {
  logger.info('[index] Starting detection loop...')
  const targets = loadTargets()

  startApiServer()
  startListener()
  startMonitor()
  startHealthServer()

  try {
    await syncRegisteredPhotos()
  } catch (err) {
    logger.error({ err }, '[index] Failed to sync registry')
  }

  const tick = async () => {
    logger.info(`[index] Tick at ${new Date().toISOString()}`)
    await crawlAndInsert(targets)
    await processPending()
    await processMatched()
    await processVerified()
    await processClassified()
    await processEnforcement()
    logger.info('[index] Tick complete')
  }

  await tick()
  setInterval(tick, LOOP_INTERVAL_MS)
}

runLoop().catch(err => {
  logger.error({ err }, '[index] Fatal error')
  process.exit(1)
})
