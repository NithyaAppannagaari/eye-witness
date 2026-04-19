import express from 'express'
import { Queue } from 'bullmq'
import { logger } from './logger'

const HEALTH_PORT = parseInt(process.env.HEALTH_PORT ?? '3002', 10)
const STALL_THRESHOLD_MS = 5 * 60_000 // 503 if no job completed in 5 min

let lastJobAt: Date | null = null

export function recordJobCompletion(): void {
  lastJobAt = new Date()
}

export function startHealthServer(queue?: Queue): void {
  const app = express()

  app.get('/health', async (req, res) => {
    try {
      const queueDepth = queue ? await queue.getWaitingCount() : 0
      const stalled = lastJobAt
        ? Date.now() - lastJobAt.getTime() > STALL_THRESHOLD_MS
        : false

      if (stalled) {
        res.status(503).json({ status: 'stalled', queueDepth, lastJobAt: lastJobAt?.toISOString() ?? null })
        return
      }

      res.json({ status: 'ok', queueDepth, lastJobAt: lastJobAt?.toISOString() ?? null })
    } catch (err) {
      res.status(503).json({ status: 'error', error: String(err) })
    }
  })

  app.listen(HEALTH_PORT, () => {
    logger.info(`[health] /health endpoint listening on http://localhost:${HEALTH_PORT}`)
  })
}
