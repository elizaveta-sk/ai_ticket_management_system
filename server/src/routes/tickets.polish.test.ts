import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { ticketReplyMaxLength } from 'core/tickets'
import express, { type NextFunction, type Request, type Response } from 'express'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { isPolishConfigured, polishReply } from '../lib/polish-reply.ts'
import { prisma } from '../lib/prisma.ts'
import { ticketsRouter } from './tickets.ts'

const auth = vi.hoisted(() => ({ signedIn: true }))

vi.mock('../lib/prisma.ts', () => ({
  prisma: { ticket: { findUnique: vi.fn() } },
}))
vi.mock('../lib/polish-reply.ts', () => ({
  isPolishConfigured: vi.fn(),
  polishReply: vi.fn(),
}))
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

let server: Server
let baseUrl: string
// The router's limiter lasts for the whole file, so each test is a different user.
let userNumber = 0

function polish(body: unknown, ticketId: string = '7', user = `user-${userNumber}`) {
  return fetch(`${baseUrl}/api/tickets/${ticketId}/replies/polish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-test-user': user },
    body: JSON.stringify(body),
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
  vi.mocked(isPolishConfigured).mockReturnValue(true)
  vi.mocked(prisma.ticket.findUnique).mockResolvedValue({ senderName: 'Grace Student' } as never)
  vi.mocked(polishReply).mockResolvedValue('Hi Grace,\n\nDone.\n\nThanks,\nAda Agent')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(polishReply).mockReset()
})

describe('POST /api/tickets/:id/replies/polish', () => {
  it('returns the polished reply', async () => {
    const res = await polish({ body: 'done' })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ body: 'Hi Grace,\n\nDone.\n\nThanks,\nAda Agent' })
  })

  it("polishes the trimmed draft with the ticket's sender and the signed-in user", async () => {
    await polish({ body: '  done\n' })

    expect(prisma.ticket.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
      select: { senderName: true },
    })
    expect(polishReply).toHaveBeenCalledWith('done', {
      customerName: 'Grace Student',
      agentName: 'Ada Agent',
    })
  })

  it('rejects anyone signed out, before calling the model', async () => {
    auth.signedIn = false

    const res = await polish({ body: 'done' })

    expect(res.status).toBe(401)
    expect(polishReply).not.toHaveBeenCalled()
  })

  it.each([
    ['an empty draft', { body: ' \n ' }, 'Reply is required'],
    ['a missing draft', {}, 'Reply is required'],
    [
      'a draft over the maximum length',
      { body: 'a'.repeat(ticketReplyMaxLength + 1) },
      `Reply must be at most ${ticketReplyMaxLength} characters`,
    ],
  ])('answers 400 for %s, without calling the model', async (_label, body, error) => {
    const res = await polish(body)

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error })
    expect(polishReply).not.toHaveBeenCalled()
  })

  it.each(['abc', '0', '99999999999'])('answers 404 for the invalid ticket id %s', async (id) => {
    const res = await polish({ body: 'done' }, id)

    expect(res.status).toBe(404)
    expect(polishReply).not.toHaveBeenCalled()
  })

  it('answers 404 for a ticket that does not exist, without calling the model', async () => {
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue(null)

    const res = await polish({ body: 'done' })

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Ticket not found' })
    expect(polishReply).not.toHaveBeenCalled()
  })

  it('answers 503 when no API key is configured, without calling the model', async () => {
    vi.mocked(isPolishConfigured).mockReturnValue(false)

    const res = await polish({ body: 'done' })

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({ error: 'Reply polishing is not configured' })
    expect(polishReply).not.toHaveBeenCalled()
  })

  it.each([
    ['nothing usable', null],
    ['a reply too long to send', 'a'.repeat(ticketReplyMaxLength + 1)],
  ])('answers 502 when the model returns %s', async (_label, polished) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(polishReply).mockResolvedValue(polished)

    const res = await polish({ body: 'done' })

    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toEqual({ error: 'Could not polish the reply' })
    expect(log).toHaveBeenCalled()
  })

  it('answers 502 when the model fails, logging only the message and not the draft', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(polishReply).mockRejectedValue(
      Object.assign(new Error('Model failed'), { requestBodyValues: { input: 'secret draft' } }),
    )

    const res = await polish({ body: 'secret draft' })

    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toEqual({ error: 'Could not polish the reply' })
    expect(log).toHaveBeenCalledWith('Could not polish a reply:', 'Model failed')
  })

  it("answers 429 on a user's 11th request in a minute, without calling the model", async () => {
    const statuses = []
    for (let i = 0; i < 11; i++) {
      statuses.push((await polish({ body: 'done' })).status)
    }

    expect(statuses).toEqual([...Array(10).fill(200), 429])
    expect(polishReply).toHaveBeenCalledTimes(10)
    expect((await polish({ body: 'done' }, '7', 'another-user')).status).toBe(200)
  })
})
