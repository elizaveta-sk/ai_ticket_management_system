import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { TicketStats } from 'core/tickets'
import express, { type NextFunction, type Request, type Response } from 'express'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { prisma } from '../lib/prisma.ts'
import { ticketsRouter } from './tickets.ts'

const auth = vi.hoisted(() => ({ signedIn: true }))

vi.mock('../lib/prisma.ts', () => ({
  prisma: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    ticket: { count: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('../middleware/require-auth.ts', () => ({
  requireAuth: (_req: Request, res: Response, next: NextFunction) => {
    if (!auth.signedIn) {
      res.status(401).json({ error: 'Not signed in' })
      return
    }
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
  vi.mocked(prisma.$transaction).mockReset()
  vi.mocked(prisma.ticket.count).mockReset()
  vi.mocked(prisma.ticket.findUnique).mockReset()
  vi.mocked(prisma.ticket.update).mockReset()
})

function statsReturn(total: number, open: number, byAi: number, seconds: number | null) {
  vi.mocked(prisma.$transaction).mockResolvedValue([total, open, byAi, [{ seconds }]] as never)
}

describe('GET /api/tickets/stats', () => {
  it('returns the counts, the percentage and the average', async () => {
    statsReturn(8, 3, 1, 90.5)

    const res = await fetch(`${baseUrl}/stats`)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      stats: {
        total: 8,
        open: 3,
        resolvedByAi: 1,
        resolvedByAiPercent: 12.5,
        averageResolutionSeconds: 90.5,
      },
    })
  })

  it('rounds the percentage to one decimal place', async () => {
    statsReturn(3, 0, 1, null)

    const { stats } = (await (await fetch(`${baseUrl}/stats`)).json()) as { stats: TicketStats }

    expect(stats.resolvedByAiPercent).toBe(33.3)
  })

  it('has no percentage or average when there is nothing to work them out from', async () => {
    statsReturn(0, 0, 0, null)

    const { stats } = (await (await fetch(`${baseUrl}/stats`)).json()) as { stats: TicketStats }

    expect(stats.resolvedByAiPercent).toBeNull()
    expect(stats.averageResolutionSeconds).toBeNull()
  })

  it('counts only tickets that have finished processing', async () => {
    statsReturn(1, 1, 0, null)

    await fetch(`${baseUrl}/stats`)

    expect(vi.mocked(prisma.ticket.count).mock.calls.map(([args]) => args?.where)).toEqual([
      { status: { in: ['open', 'resolved', 'closed'] } },
      { status: 'open' },
      { resolvedByAi: true },
    ])
  })

  it('needs a session', async () => {
    auth.signedIn = false

    const res = await fetch(`${baseUrl}/stats`)

    expect(res.status).toBe(401)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/tickets/:id resolution time', () => {
  function patch(status: string) {
    vi.mocked(prisma.ticket.update).mockResolvedValue({ id: 7, status } as never)
    return fetch(`${baseUrl}/7`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    })
  }
  const saved = () => vi.mocked(prisma.ticket.update).mock.calls[0][0].data

  it('records the time when a ticket is first resolved', async () => {
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue({ resolvedAt: null } as never)

    await patch('resolved')

    expect(saved().resolvedAt).toBeInstanceOf(Date)
  })

  it('keeps the original time when a resolved ticket is saved or closed and resolved again', async () => {
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue({
      resolvedAt: new Date('2026-11-01T10:00:00Z'),
    } as never)

    await patch('resolved')

    expect(saved()).toEqual({ status: 'resolved' })
  })

  it('clears the time when a ticket is reopened', async () => {
    await patch('open')

    expect(saved()).toEqual({ status: 'open', resolvedByAi: false, resolvedAt: null })
  })

  it('keeps the time when a ticket is closed', async () => {
    await patch('closed')

    expect(saved()).toEqual({ status: 'closed', resolvedByAi: false })
  })
})
