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
  it.each(['users', 'agents'])('is left out of GET /api/%s', async (path) => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([])

    await fetch(`${baseUrl}/${path}`)

    expect(vi.mocked(prisma.user.findMany).mock.calls[0][0]?.where?.id).toEqual({ not: 'jane-ai' })
  })

  it('cannot be edited, which could give it a password', async () => {
    const res = await fetch(`${baseUrl}/users/jane-ai`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Jane', email: 'jane@test.dev', password: 'a-long-password-1' }),
    })

    expect(res.status).toBe(404)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('cannot be deleted', async () => {
    const res = await fetch(`${baseUrl}/users/jane-ai`, { method: 'DELETE' })

    expect(res.status).toBe(404)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
