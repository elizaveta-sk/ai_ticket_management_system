import type { NextFunction, Request, Response } from 'express'

// Use after requireAuth, which sets req.user.
export function requireRole(role: 'admin' | 'agent') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    next()
  }
}
