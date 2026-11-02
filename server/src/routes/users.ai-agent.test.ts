import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import express, { type NextFunction, type Request, type Response } from 'express'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { prisma } from '../lib/prisma.ts'
import { usersRouter } from './users.ts'

vi.mock('../lib/prisma.ts', () => ({
  prisma: {
    $transaction: vi.fn(),
    user: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('../middleware/require-auth.ts', () => ({
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
}))
vi.mock('../middleware/require-role.ts', () => ({
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}))

let server: Server
let baseUrl: string

beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use('/api', usersRouter)
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve())
  })
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}/api`
})

afterAll(() => {
  server.close()
})

afterEach(() => {
  vi.mocked(prisma.$transaction).mockReset()
  vi.mocked(prisma.user.findMany).mockReset()
  vi.mocked(prisma.user.findFirst).mockReset()
  vi.mocked(prisma.user.update).mockReset()
})

describe('the AI agent', () => {
  it('is left out of GET /api/agents', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([])

    await fetch(`${baseUrl}/agents`)

    expect(vi.mocked(prisma.user.findMany).mock.calls[0][0]?.where?.id).toEqual({ not: 'jane-ai' })
  })

  it('is included in GET /api/users', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([])

    await fetch(`${baseUrl}/users`)

    expect(vi.mocked(prisma.user.findMany).mock.calls[0][0]?.where).toEqual({ deletedAt: null })
  })

  it('can be renamed, and only the name is written', async () => {
    vi.mocked(prisma.user.update).mockResolvedValue({ id: 'jane-ai', name: 'Janet' } as never)

    const res = await fetch(`${baseUrl}/users/jane-ai`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Janet', email: 'jane@test.dev', password: 'a-long-password-1' }),
    })

    expect(res.status).toBe(200)
    expect(vi.mocked(prisma.user.update).mock.calls[0][0].data).toEqual({ name: 'Janet' })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a name that is too short', async () => {
    const res = await fetch(`${baseUrl}/users/jane-ai`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'J' }),
    })

    expect(res.status).toBe(400)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('cannot be deleted', async () => {
    const res = await fetch(`${baseUrl}/users/jane-ai`, { method: 'DELETE' })

    expect(res.status).toBe(404)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
