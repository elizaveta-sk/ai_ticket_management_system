import { toNodeHandler } from 'better-auth/node'
import express from 'express'
import { auth } from './lib/auth.ts'
import { prisma } from './lib/prisma.ts'
import { contactRouter } from './routes/contact.ts'
import { inboundParseRouter } from './routes/inbound-parse.ts'
import { ticketsRouter } from './routes/tickets.ts'
import { usersRouter } from './routes/users.ts'
import { webhooksRouter } from './routes/webhooks.ts'

export const app = express()

// Must come before express.json(): Better Auth reads the raw request body.
app.all('/api/auth/{*any}', toNodeHandler(auth))

// Must come before express.json(): these routers set their own body size limits.
app.use('/api/webhooks', webhooksRouter)
app.use('/api/webhooks', inboundParseRouter)

app.use(express.json())

app.use('/api', contactRouter)
app.use('/api', usersRouter)
app.use('/api', ticketsRouter)

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok', database: 'connected' })
  } catch {
    res.status(503).json({ status: 'ok', database: 'unreachable' })
  }
})
