import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { ticketViews } from 'core/tickets'
import express, { type NextFunction, type Request, type Response } from 'express'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../lib/prisma.ts'
import { ticketsRouter } from './tickets.ts'

const auth = vi.hoisted(() => ({ signedIn: true }))

vi.mock('../lib/prisma.ts', () => ({
  prisma: {
    $transaction: vi.fn(),
    ticket: { count: vi.fn(), findMany: vi.fn() },
  },
}))
vi.mock('../middleware/require-auth.ts', () => ({
  requireAuth: (req: Request, res: Response, next: NextFunction) => {
    if (!auth.signedIn) {
      res.status(401).json({ error: 'Not signed in' })
      return
    }
    req.user = { id: 'user-1' } as Request['user']
    next()
  },
}))

let server: Server
let baseUrl: string

beforeAll(async () => {
  const app = express()
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
  vi.mocked(prisma.$transaction).mockReset()
  vi.mocked(prisma.ticket.count).mockReset()
  vi.mocked(prisma.ticket.findMany).mockReset()
})

const visible = { status: { in: ['open', 'resolved', 'closed'] } }

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
    ['open', { status: 'open' }],
    ['mine', { status: 'open', assignedToId: 'user-1' }],
    ['unassigned', { status: 'open', assignedToId: null }],
    ['refunds', { status: 'open', category: 'refund_request' }],
    ['resolved_by_ai', { status: 'resolved', resolvedByAi: true }],
    ['resolved_by_agent', { status: 'resolved', resolvedByAi: false }],
    ['closed', { status: 'closed' }],
    ['all', {}],
  ])('applies the %s view, and never shows tickets still in processing', async (view, filter) => {
    const where = await whereFor(`view=${view}`)

    expect(where?.AND).toEqual(expect.arrayContaining([visible, filter]))
  })

  it('shows every visible ticket without a view', async () => {
    const where = await whereFor('')

    expect(where?.AND).toEqual(expect.arrayContaining([visible, {}]))
  })

  it('keeps a filter as a separate condition from the view', async () => {
    const where = await whereFor('view=open&assignedToId=agent-2&category=uncategorized')

    expect(where?.AND).toEqual(
      expect.arrayContaining([
        { status: 'open' },
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
      counts: {
        open: 0,
        mine: 1,
        unassigned: 2,
        refunds: 3,
        resolved_by_ai: 4,
        resolved_by_agent: 5,
        closed: 6,
        all: 7,
      },
    })
  })

  it('counts with the same filters as the list', async () => {
    vi.mocked(prisma.$transaction).mockResolvedValue(ticketViews.map(() => 0) as never)

    await fetch(`${baseUrl}/view-counts`)

    expect(prisma.ticket.count).toHaveBeenCalledWith({
      where: { AND: [visible, { status: 'open', assignedToId: 'user-1' }] },
    })
  })

  it('requires a session', async () => {
    auth.signedIn = false

    const res = await fetch(`${baseUrl}/view-counts`)

    expect(res.status).toBe(401)
  })
})
