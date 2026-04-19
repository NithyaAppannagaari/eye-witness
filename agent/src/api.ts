import express from 'express'
import cors from 'cors'
import { getDb } from './db'

const PORT = 3001

export function startApiServer(): void {
  const app = express()
  app.use(cors({ origin: 'http://localhost:3000' }))

  // Returns all detections for photos owned by a given wallet
  app.get('/api/detections', (req, res) => {
    const wallet = req.query.wallet as string | undefined
    if (!wallet) {
      res.status(400).json({ error: 'wallet query param required' })
      return
    }
    const rows = getDb()
      .prepare(
        "SELECT * FROM detections WHERE ownerWallet = ? AND status NOT IN ('pending', 'no_match')"
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
         WHERE ownerWallet = ?
           AND status IN ('awaiting_enforcement','blocked_category','dmca_sent','resolved')
         ORDER BY createdAt DESC`
      )
      .all(wallet.toLowerCase())
    res.json(rows)
  })

  app.listen(PORT, () => {
    console.log(`[api] Detection API listening on http://localhost:${PORT}`)
  })
}
