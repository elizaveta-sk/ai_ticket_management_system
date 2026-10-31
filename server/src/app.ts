import { toNodeHandler } from 'better-auth/node'
import express from 'express'
import { auth } from './lib/auth.ts'
import { prisma } from './lib/prisma.ts'
import { requireAuth } from './middleware/require-auth.ts'
import { requireRole } from './middleware/require-role.ts'

export const app = express()

// Must come before express.json(): Better Auth reads the raw request body.
app.all('/api/auth/{*any}', toNodeHandler(auth))

app.use(express.json())

app.get('/api/me', requireAuth, (req, res) => {
  const { id, name, email, role } = req.user!
  res.json({ user: { id, name, email, role } })
})

app.get('/api/users', requireAuth, requireRole('admin'), async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  res.json({ users })
})

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok', database: 'connected' })
  } catch {
    res.status(503).json({ status: 'ok', database: 'unreachable' })
  }
})
