import type { NextFunction, Request, Response } from 'express'

// Counters are in memory, so they reset on restart and assume a single instance.
function rateLimit(max: number, windowMs: number, getKey: (req: Request) => string) {
  const windows = new Map<string, { count: number; resetAt: number }>()

  return (req: Request, res: Response, next: NextFunction) => {
    const key = getKey(req)
    const now = Date.now()
    const current = windows.get(key)

    if (!current || now >= current.resetAt) {
      windows.set(key, { count: 1, resetAt: now + windowMs })
      next()
      return
    }
    if (current.count >= max) {
      res.set('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)))
      res.status(429).json({ error: 'Too many requests. Please try again shortly.' })
      return
    }
    current.count++
    next()
  }
}

// Goes after requireAuth, because it counts by user.
export function rateLimitPerUser(max: number, windowMs: number) {
  return rateLimit(max, windowMs, (req) => req.user!.id)
}

// One counter shared by every caller of a public route. A spammer can use up the limit
// for everyone, but can't get past it by faking the headers that identify a visitor.
export function rateLimitTotal(max: number, windowMs: number) {
  return rateLimit(max, windowMs, () => 'total')
}
