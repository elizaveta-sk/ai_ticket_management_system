import express from 'express'
import { sql } from 'bun'

export const app = express()

app.use(express.json())

app.get('/api/health', async (_req, res) => {
  try {
    await sql`SELECT 1`
    res.json({ status: 'ok', database: 'connected' })
  } catch {
    res.status(503).json({ status: 'ok', database: 'unreachable' })
  }
})
