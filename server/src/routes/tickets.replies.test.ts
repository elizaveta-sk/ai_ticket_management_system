import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import express, { type NextFunction, type Request, type Response } from 'express'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { isEmailConfigured, sendEmail } from '../lib/email.ts'
import { prisma } from '../lib/prisma.ts'
import { ticketsRouter } from './tickets.ts'

vi.mock('../lib/prisma.ts', () => ({
  prisma: {
    $transaction: vi.fn(),
    ticket: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    ticketReply: { create: vi.fn() },
  },
}))
vi.mock('../lib/email.ts', () => ({ isEmailConfigured: vi.fn(), sendEmail: vi.fn() }))
vi.mock('../middleware/require-auth.ts', () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: 'agent-1' } as Request['user']
    next()
  },
}))

let server: Server
let baseUrl: string

beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use('/api', ticketsRouter)
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve())
  })
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}/api/tickets`
})

afterAll(() => {
  server.close()
})

const saved = { id: 1, body: 'We are on it.', senderType: 'agent' }

function postReply() {
  return fetch(`${baseUrl}/7/replies`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ body: 'We are on it.' }),
  })
}

beforeEach(() => {
  vi.mocked(isEmailConfigured).mockReturnValue(true)
  vi.mocked(prisma.ticketReply.create).mockResolvedValue({
    ...saved,
    ticket: { senderEmail: 'grace@test.dev', subject: 'Videos' },
  } as never)
  vi.mocked(prisma.$transaction).mockResolvedValue([[], 0] as never)
  vi.mocked(prisma.ticket.update).mockResolvedValue({ id: 7 } as never)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(sendEmail).mockReset()
  vi.mocked(prisma.ticket.findMany).mockReset()
  vi.mocked(prisma.ticket.count).mockReset()
  vi.mocked(prisma.ticket.update).mockReset()
  vi.mocked(prisma.ticketReply.create).mockReset()
})

describe('POST /api/tickets/:id/replies', () => {
  it('emails the reply to the ticket sender', async () => {
    const res = await postReply()

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ reply: saved, emailFailed: false })
    expect(sendEmail).toHaveBeenCalledWith({
      to: 'grace@test.dev',
      subject: 'Re: Videos',
      text: 'We are on it.',
    })
  })

  it('keeps the reply and reports it when the email fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(sendEmail).mockRejectedValue(new Error('Forbidden'))

    const res = await postReply()

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ reply: saved, emailFailed: true })
    expect(log).toHaveBeenCalledWith('Could not email the reply on ticket 7:', 'Forbidden')
  })

  it('saves the reply without sending when email is not configured', async () => {
    vi.mocked(isEmailConfigured).mockReturnValue(false)

    const res = await postReply()

    expect(await res.json()).toEqual({ reply: saved, emailFailed: false })
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe('GET /api/tickets', () => {
  it('leaves out tickets the AI resolved or is still working on', async () => {
    const res = await fetch(baseUrl)

    expect(res.status).toBe(200)
    for (const mock of [prisma.ticket.findMany, prisma.ticket.count]) {
      const where = vi.mocked(mock).mock.calls[0][0]?.where
      expect(where?.resolvedByAi).toBe(false)
      expect(where?.status).toEqual({ in: ['open', 'resolved', 'closed'] })
    }
  })

  it('keeps the status filter when one is chosen', async () => {
    await fetch(`${baseUrl}?status=resolved`)

    expect(vi.mocked(prisma.ticket.findMany).mock.calls[0][0]?.where?.status).toBe('resolved')
  })
})

describe('GET /api/tickets/:id', () => {
  it.each(['new', 'processing'])('shows a %s ticket as open', async (status) => {
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue({ id: 7, status } as never)

    const res = await fetch(`${baseUrl}/7`)

    expect(await res.json()).toEqual({ ticket: { id: 7, status: 'open' } })
  })
})

describe('PATCH /api/tickets/:id', () => {
  function patch(body: object) {
    return fetch(`${baseUrl}/7`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('returns a reopened ticket to the list', async () => {
    await patch({ status: 'open' })

    expect(vi.mocked(prisma.ticket.update).mock.calls[0][0].data).toEqual({
      status: 'open',
      resolvedByAi: false,
    })
  })

  it('does not change the flag for other edits', async () => {
    await patch({ category: 'general_question' })

    expect(vi.mocked(prisma.ticket.update).mock.calls[0][0].data).toEqual({
      category: 'general_question',
    })
  })
})
