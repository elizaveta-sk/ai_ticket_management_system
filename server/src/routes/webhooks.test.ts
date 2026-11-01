import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '../generated/prisma/client.ts'
import { classifyTicketInBackground } from '../lib/classify-ticket.ts'
import { prisma } from '../lib/prisma.ts'
import { webhooksRouter } from './webhooks.ts'

vi.mock('../lib/prisma.ts', () => ({
  prisma: { ticket: { create: vi.fn(), findUnique: vi.fn() } },
}))
vi.mock('../lib/classify-ticket.ts', () => ({ classifyTicketInBackground: vi.fn() }))
vi.mock('../middleware/require-webhook-secret.ts', () => ({
  requireWebhookSecret: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next(),
}))

const email = {
  messageId: '<1@example.com>',
  from: 'grace@example.com',
  fromName: 'Grace Student',
  subject: 'Refund',
  text: 'Please refund me.',
}
const created = {
  id: 7,
  subject: 'Refund',
  body: 'Please refund me.',
  status: 'open',
  category: null,
}

let server: Server
let baseUrl: string

function deliver(body: unknown) {
  return fetch(`${baseUrl}/api/webhooks/inbound-email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeAll(async () => {
  const app = express()
  app.use('/api/webhooks', webhooksRouter)
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve())
  })
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
})

beforeEach(() => {
  vi.mocked(prisma.ticket.create).mockResolvedValue(created as never)
  vi.mocked(classifyTicketInBackground).mockResolvedValue(undefined)
})

afterEach(() => {
  vi.mocked(prisma.ticket.create).mockReset()
  vi.mocked(prisma.ticket.findUnique).mockReset()
  vi.mocked(classifyTicketInBackground).mockReset()
})

describe('POST /api/webhooks/inbound-email', () => {
  it('classifies a new ticket from its subject and body', async () => {
    const res = await deliver(email)

    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toEqual({ ticket: created })
    expect(classifyTicketInBackground).toHaveBeenCalledTimes(1)
    expect(classifyTicketInBackground).toHaveBeenCalledWith(created)
  })

  it('creates the ticket from the email', async () => {
    await deliver(email)

    expect(prisma.ticket.create).toHaveBeenCalledWith({
      data: {
        messageId: '<1@example.com>',
        senderEmail: 'grace@example.com',
        senderName: 'Grace Student',
        subject: 'Refund',
        body: 'Please refund me.',
      },
      select: { id: true, subject: true, body: true, status: true, category: true },
    })
  })

  it('answers without waiting for the classification to finish', async () => {
    vi.mocked(classifyTicketInBackground).mockReturnValue(new Promise(() => {}))

    const res = await deliver(email)

    expect(res.status).toBe(201)
    expect(classifyTicketInBackground).toHaveBeenCalledTimes(1)
  })

  it('does not classify a repeated delivery again', async () => {
    vi.mocked(prisma.ticket.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    )
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue(created as never)

    const res = await deliver(email)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ticket: created })
    expect(classifyTicketInBackground).not.toHaveBeenCalled()
  })

  it('does not classify an email that is rejected', async () => {
    const res = await deliver({ ...email, from: 'not-an-email' })

    expect(res.status).toBe(400)
    expect(prisma.ticket.create).not.toHaveBeenCalled()
    expect(classifyTicketInBackground).not.toHaveBeenCalled()
  })
})
