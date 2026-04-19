import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import { Worker, Job } from 'bullmq'
import Redis from 'ioredis'
import { crawlAndInsert } from './crawler'
import { processPending, processMatched, processVerified, processClassified, processEnforcement } from './pipeline'
import { logger } from './logger'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const RATE_LIMIT_WINDOW_MS = 5_000

const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null })

async function enforceRateLimit(domain: string): Promise<void> {
  const key = `ratelimit:${domain}`
  const last = await connection.get(key)
  if (last) {
    const elapsed = Date.now() - parseInt(last, 10)
    if (elapsed < RATE_LIMIT_WINDOW_MS) {
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_WINDOW_MS - elapsed))
    }
  }
  await connection.set(key, Date.now().toString(), 'EX', 10)
}

async function processJob(job: Job): Promise<void> {
  const { url } = job.data as { url: string }
  logger.info({ jobId: job.id, url }, '[worker] Starting job')

  const domain = new URL(url).hostname
  await enforceRateLimit(domain)

  await crawlAndInsert([url])
  await processPending()
  await processMatched()
  await processVerified()
  await processClassified()
  await processEnforcement()
}

const worker = new Worker('eyewitness:crawl', processJob, {
  connection: new Redis(REDIS_URL, { maxRetriesPerRequest: null }),
  concurrency: 3,
})

worker.on('completed', (job) => {
  logger.info({ jobId: job.id, url: job.data.url }, '[worker] Job completed')
})

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, url: job?.data?.url, err: err.message }, '[worker] Job failed')
})

worker.on('error', (err) => {
  logger.error({ err }, '[worker] Worker error')
})

logger.info('[worker] BullMQ worker started — concurrency: 3')

// Graceful shutdown
process.on('SIGTERM', async () => {
  await worker.close()
  await connection.quit()
  logger.info('[worker] Shut down cleanly')
  process.exit(0)
})
