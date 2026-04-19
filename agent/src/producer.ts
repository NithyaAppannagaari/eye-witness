import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import fs from 'fs'
import { Queue } from 'bullmq'
import Redis from 'ioredis'
import { logger } from './logger'

const TARGETS_PATH = path.resolve(__dirname, '../targets.json')
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null })

export const crawlQueue = new Queue('eyewitness:crawl', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
})

export async function enqueueTargets(): Promise<void> {
  const targets = JSON.parse(fs.readFileSync(TARGETS_PATH, 'utf-8')) as string[]
  for (const url of targets) {
    await crawlQueue.add('crawl', { url })
  }
  logger.info({ count: targets.length }, '[producer] Enqueued crawl jobs')
}

// Run as standalone script (PM2 process on a schedule)
if (require.main === module) {
  const ENQUEUE_INTERVAL_MS = 60_000

  const tick = async () => {
    try {
      await enqueueTargets()
    } catch (err) {
      logger.error({ err }, '[producer] Failed to enqueue targets')
    }
  }

  tick()
  setInterval(tick, ENQUEUE_INTERVAL_MS)
  logger.info('[producer] Producer started — enqueueing every 60s')
}
