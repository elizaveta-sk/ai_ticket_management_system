import { toNodeHandler } from 'better-auth/node'
import express from 'express'
import { auth } from './lib/auth.ts'
import { prisma } from './lib/prisma.ts'
import { usersRouter } from './routes/users.ts'
import { webhooksRouter } from './routes/webhooks.ts'

export const app = express()

// Must come before express.json(): Better Auth reads the raw request body.
app.all('/api/auth/{*any}', toNodeHandler(auth))

// Must come before express.json(): this router sets its own body size limit.
app.use('/api/webhooks', webhooksRouter)

app.use(express.json())

app.use('/api', usersRouter)

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok', database: 'connected' })
  } catch {
    res.status(503).json({ status: 'ok', database: 'unreachable' })
  }
})
