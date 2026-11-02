import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { ticketViews } from 'core/tickets'
import express, { type NextFunction, type Request, type Response } from 'express'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../lib/prisma.ts'
import { ticketsRouter } from './tickets.ts'

const auth = vi.hoisted(() => ({ signedIn: true, role: 'agent' }))

vi.mock('../lib/prisma.ts', () => ({
  prisma: {
    $transaction: vi.fn(),
    ticket: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('../middleware/require-auth.ts', () => ({
  requireAuth: (req: Request, res: Response, next: NextFunction) => {
    if (!auth.signedIn) {
      res.status(401).json({ error: 'Not signed in' })
      return
    }
    req.user = { id: 'user-1', role: auth.role } as Request['user']
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

afterEach(() => {
  auth.signedIn = true
  auth.role = 'agent'
  vi.mocked(prisma.$transaction).mockReset()
  vi.mocked(prisma.ticket.count).mockReset()
  vi.mocked(prisma.ticket.findMany).mockReset()
  vi.mocked(prisma.ticket.findUnique).mockReset()
  vi.mocked(prisma.ticket.update).mockReset()
})

const visible = { status: { in: ['open', 'resolved', 'closed'] } }
const notRefund = { OR: [{ category: null }, { category: { not: 'refund_request' } }] }
const agentAttention = {
  status: 'open',
  AND: [notRefund, { OR: [{ assignedToId: 'user-1' }, { assignedToId: null }] }],
}

describe('GET /api/tickets with a view', () => {
  beforeEach(() => {
    vi.mocked(prisma.$transaction).mockResolvedValue([[], 0] as never)
  })

  async function whereFor(query: string) {
    const res = await fetch(`${baseUrl}?${query}`)
    expect(res.status).toBe(200)
    return vi.mocked(prisma.ticket.findMany).mock.lastCall?.[0]?.where
  }

  it.each([
    ['attention', agentAttention],
    ['refunds', { status: 'open', category: 'refund_request' }],
    ['resolved', { status: 'resolved' }],
    ['closed', { status: 'closed' }],
    ['all', {}],
  ])('applies the %s view, and never shows tickets still in processing', async (view, filter) => {
    const where = await whereFor(`view=${view}`)

    expect(where?.AND).toEqual(expect.arrayContaining([visible, filter]))
  })

  it('shows an admin every open ticket except refund requests in Need attention', async () => {
    auth.role = 'admin'

    const where = await whereFor('view=attention')

    expect(where?.AND).toContainEqual({ status: 'open', AND: [notRefund, {}] })
  })

  it('shows every visible ticket without a view', async () => {
    const where = await whereFor('')

    expect(where?.AND).toEqual(expect.arrayContaining([visible, {}]))
  })

  it('keeps a filter as a separate condition from the view', async () => {
    const where = await whereFor('view=resolved&assignedToId=agent-2&category=uncategorized')

    expect(where?.AND).toEqual(
      expect.arrayContaining([
        { status: 'resolved' },
        { status: undefined, category: null, assignedToId: 'agent-2' },
      ]),
    )
  })

  it('rejects an unknown view', async () => {
    const res = await fetch(`${baseUrl}?view=nope`)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid view' })
  })
})

describe('GET /api/tickets/view-counts', () => {
  it('returns a count for each view', async () => {
    vi.mocked(prisma.$transaction).mockResolvedValue(ticketViews.map((_, index) => index) as never)

    const res = await fetch(`${baseUrl}/view-counts`)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      counts: { attention: 0, refunds: 1, resolved: 2, closed: 3, all: 4 },
    })
  })

  it('counts with the same filters as the list', async () => {
    vi.mocked(prisma.$transaction).mockResolvedValue(ticketViews.map(() => 0) as never)

    await fetch(`${baseUrl}/view-counts`)

    expect(prisma.ticket.count).toHaveBeenCalledWith({
      where: { AND: [visible, agentAttention] },
    })
  })

  it('requires a session', async () => {
    auth.signedIn = false

    const res = await fetch(`${baseUrl}/view-counts`)

    expect(res.status).toBe(401)
  })
})

describe('PATCH /api/tickets/:id closing a ticket', () => {
  function close() {
    return fetch(`${baseUrl}/7`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'closed' }),
    })
  }

  it.each(['open', 'new', 'processing'])('refuses to close a %s ticket', async (status) => {
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue({ status } as never)

    const res = await close()

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Resolve the ticket before closing it' })
    expect(prisma.ticket.update).not.toHaveBeenCalled()
  })

  it('closes a resolved ticket', async () => {
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue({ status: 'resolved' } as never)
    vi.mocked(prisma.ticket.update).mockResolvedValue({ id: 7, status: 'closed' } as never)

    const res = await close()

    expect(res.status).toBe(200)
    expect(prisma.ticket.update).toHaveBeenCalledOnce()
  })
})
