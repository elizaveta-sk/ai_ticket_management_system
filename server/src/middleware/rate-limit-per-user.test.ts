import type { Request, Response } from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rateLimitPerUser } from './rate-limit-per-user.ts'

function call(limit: ReturnType<typeof rateLimitPerUser>, userId: string) {
  const next = vi.fn()
  const res = {
    set: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  }
  limit({ user: { id: userId } } as unknown as Request, res as unknown as Response, next)
  return { next, res }
}

describe('rateLimitPerUser', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows requests up to the limit', () => {
    const limit = rateLimitPerUser(10, 60_000)

    for (let i = 0; i < 10; i++) {
      expect(call(limit, 'ada').next).toHaveBeenCalledTimes(1)
    }
  })

  it('answers 429 with a Retry-After once over the limit, without continuing', () => {
    const limit = rateLimitPerUser(1, 60_000)
    call(limit, 'ada')
    vi.advanceTimersByTime(15_000)

    const { next, res } = call(limit, 'ada')

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.set).toHaveBeenCalledWith('Retry-After', '45')
    expect(res.json).toHaveBeenCalledWith({ error: 'Too many requests. Please try again shortly.' })
  })

  it('counts each user separately', () => {
    const limit = rateLimitPerUser(1, 60_000)
    call(limit, 'ada')

    expect(call(limit, 'ada').next).not.toHaveBeenCalled()
    expect(call(limit, 'grace').next).toHaveBeenCalledTimes(1)
  })

  it('allows requests again when the window ends, and not before', () => {
    const limit = rateLimitPerUser(1, 60_000)
    call(limit, 'ada')

    vi.advanceTimersByTime(59_999)
    expect(call(limit, 'ada').next).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(call(limit, 'ada').next).toHaveBeenCalledTimes(1)
  })

  it('does not extend the window for blocked requests', () => {
    const limit = rateLimitPerUser(1, 60_000)
    call(limit, 'ada')
    vi.advanceTimersByTime(30_000)
    call(limit, 'ada')
    vi.advanceTimersByTime(30_000)

    expect(call(limit, 'ada').next).toHaveBeenCalledTimes(1)
  })

  it('keeps separate counts for separate limiters', () => {
    const first = rateLimitPerUser(1, 60_000)
    const second = rateLimitPerUser(1, 60_000)
    call(first, 'ada')

    expect(call(second, 'ada').next).toHaveBeenCalledTimes(1)
  })
})
