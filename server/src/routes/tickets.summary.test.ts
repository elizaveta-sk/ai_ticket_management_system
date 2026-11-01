import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import express, { type NextFunction, type Request, type Response } from 'express'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { isOpenAIConfigured } from '../lib/openai.ts'
import { prisma } from '../lib/prisma.ts'
import { summarizeTicket } from '../lib/summarize-ticket.ts'
import { ticketsRouter } from './tickets.ts'

const auth = vi.hoisted(() => ({ signedIn: true }))

vi.mock('../lib/prisma.ts', () => ({
  prisma: { ticket: { findUnique: vi.fn() } },
}))
vi.mock('../lib/openai.ts', () => ({ isOpenAIConfigured: vi.fn() }))
vi.mock('../lib/summarize-ticket.ts', () => ({ summarizeTicket: vi.fn() }))
vi.mock('../middleware/require-auth.ts', () => ({
  requireAuth: (req: Request, res: Response, next: NextFunction) => {
    if (!auth.signedIn) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    req.user = { id: req.get('x-test-user') ?? 'ada', name: 'Ada Agent' } as Request['user']
    next()
  },
}))

const thread = {
  subject: 'Refund',
  body: 'Please refund me.',
  replies: [{ senderType: 'agent', body: 'Looking into it.' }],
}

let server: Server
let baseUrl: string
// The router's limiter lasts for the whole file, so each test is a different user.
let userNumber = 0

function summarize(ticketId = '7', user = `user-${userNumber}`) {
  return fetch(`${baseUrl}/api/tickets/${ticketId}/summary`, {
    method: 'POST',
    headers: { 'x-test-user': user },
  })
}

beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use('/api', ticketsRouter)
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve())
  })
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
})

beforeEach(() => {
  userNumber++
  auth.signedIn = true
  vi.mocked(isOpenAIConfigured).mockReturnValue(true)
  vi.mocked(prisma.ticket.findUnique).mockResolvedValue(thread as never)
  vi.mocked(summarizeTicket).mockResolvedValue('The student wants a refund.')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(summarizeTicket).mockReset()
})

describe('POST /api/tickets/:id/summary', () => {
  it('returns a summary of the ticket and its replies', async () => {
    const res = await summarize()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ summary: 'The student wants a refund.' })
    expect(summarizeTicket).toHaveBeenCalledWith(thread)
  })

  it('generates a new summary on every request', async () => {
    vi.mocked(summarizeTicket)
      .mockResolvedValueOnce('First summary.')
      .mockResolvedValueOnce('Second summary.')

    const first = await (await summarize()).json()
    const second = await (await summarize()).json()

    expect(first).toEqual({ summary: 'First summary.' })
    expect(second).toEqual({ summary: 'Second summary.' })
    expect(summarizeTicket).toHaveBeenCalledTimes(2)
  })

  it('reads replies oldest first, without their HTML', async () => {
    await summarize()

    expect(prisma.ticket.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
      select: {
        subject: true,
        body: true,
        replies: {
          select: { senderType: true, body: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    })
  })

  it('rejects anyone signed out, before calling the model', async () => {
    auth.signedIn = false

    const res = await summarize()

    expect(res.status).toBe(401)
    expect(summarizeTicket).not.toHaveBeenCalled()
  })

  it.each(['abc', '0', '99999999999'])('answers 404 for the invalid ticket id %s', async (id) => {
    const res = await summarize(id)

    expect(res.status).toBe(404)
    expect(summarizeTicket).not.toHaveBeenCalled()
  })

  it('answers 404 for a ticket that does not exist, without calling the model', async () => {
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue(null)

    const res = await summarize()

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Ticket not found' })
    expect(summarizeTicket).not.toHaveBeenCalled()
  })

  it('answers 503 when no API key is configured, without calling the model', async () => {
    vi.mocked(isOpenAIConfigured).mockReturnValue(false)

    const res = await summarize()

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({ error: 'Ticket summaries are not configured' })
    expect(summarizeTicket).not.toHaveBeenCalled()
  })

  it('answers 502 when the model returns nothing usable', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(summarizeTicket).mockResolvedValue(null)

    const res = await summarize()

    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toEqual({ error: 'Could not summarize the ticket' })
    expect(log).toHaveBeenCalled()
  })

  it('answers 502 when the model fails, logging only the message and not the ticket', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(summarizeTicket).mockRejectedValue(
      Object.assign(new Error('Model failed'), { requestBodyValues: { input: 'student details' } }),
    )

    const res = await summarize()

    expect(res.status).toBe(502)
    expect(log).toHaveBeenCalledWith('Could not summarize a ticket:', 'Model failed')
  })

  it("answers 429 on a user's 11th request in a minute, without calling the model", async () => {
    const statuses = []
    for (let i = 0; i < 11; i++) {
      statuses.push((await summarize()).status)
    }

    expect(statuses).toEqual([...Array(10).fill(200), 429])
    expect(summarizeTicket).toHaveBeenCalledTimes(10)
    expect((await summarize('7', 'another-user')).status).toBe(200)
  })
})
