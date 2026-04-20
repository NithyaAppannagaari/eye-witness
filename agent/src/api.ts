import express from 'express'
import cors from 'cors'
import { getDb } from './db'

const PORT = 3001

export function startApiServer(): void {
  const app = express()
  app.use(cors({ origin: 'http://localhost:3000' }))
  app.use(express.json())

  // Returns all detections for photos owned by a given wallet
  app.get('/api/detections', (req, res) => {
    const wallet = req.query.wallet as string | undefined
    if (!wallet) {
      res.status(400).json({ error: 'wallet query param required' })
      return
    }
    const rows = getDb()
      .prepare(
        "SELECT * FROM detections WHERE LOWER(ownerWallet) = ? AND status NOT IN ('pending', 'no_match')"
      )
      .all(wallet.toLowerCase())
    res.json(rows)
  })

  // Returns enforcement actions (disputes) for photos owned by a given wallet
  app.get('/api/disputes', (req, res) => {
    const wallet = req.query.wallet as string | undefined
    if (!wallet) {
      res.status(400).json({ error: 'wallet query param required' })
      return
    }
    const rows = getDb()
      .prepare(
        `SELECT * FROM detections
         WHERE LOWER(ownerWallet) = ?
           AND status IN ('awaiting_enforcement','blocked_category','dmca_sent','resolved')
         ORDER BY createdAt DESC`
      )
      .all(wallet.toLowerCase())
    res.json(rows)
  })

  // Requeue a detection for payment retry (resets dmca_sent → classified)
  app.post('/api/detections/:id/requeue', (req, res) => {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) { res.status(400).json({ error: 'invalid id' }); return }
    const result = getDb()
      .prepare("UPDATE detections SET status = 'classified', dmcaSentAt = NULL WHERE id = ? AND status IN ('dmca_sent', 'awaiting_enforcement', 'blocked_category')")
      .run(id)
    if (result.changes === 0) { res.status(404).json({ error: 'detection not found or not in a requeue-able state' }); return }
    res.json({ ok: true })
  })

  app.listen(PORT, () => {
    console.log(`[api] Detection API listening on http://localhost:${PORT}`)
  })
}
