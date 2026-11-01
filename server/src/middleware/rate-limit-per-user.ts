import type { NextFunction, Request, Response } from 'express'

// Goes after requireAuth, because it counts by user. Counters are in memory, so they
// reset on restart and assume a single instance.
export function rateLimitPerUser(max: number, windowMs: number) {
  const windows = new Map<string, { count: number; resetAt: number }>()

  return (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user!.id
    const now = Date.now()
    const current = windows.get(userId)

    if (!current || now >= current.resetAt) {
      windows.set(userId, { count: 1, resetAt: now + windowMs })
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
