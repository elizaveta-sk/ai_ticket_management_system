import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { inboundParseSecret } from '../lib/reply-address.ts'

function sha256(value: string) {
  return createHash('sha256').update(value).digest()
}

// SendGrid's Inbound Parse can't send a custom header, so its secret is part of the URL.
export function requireInboundParseSecret(req: Request, res: Response, next: NextFunction) {
  const secret = inboundParseSecret()
  if (!secret) {
    res.status(503).json({ error: 'Inbound email is not configured' })
    return
  }
  if (!timingSafeEqual(sha256(String(req.params.secret)), sha256(secret))) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
}

// Webhooks come from a service rather than a signed-in user, so they prove
// themselves with a shared secret. Refuses everything if the secret isn't set.
export function requireWebhookSecret(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.INBOUND_EMAIL_SECRET
  if (!secret || secret.length < 32 || secret.startsWith('YOUR_')) {
    res.status(503).json({ error: 'Inbound email is not configured' })
    return
  }

  // Hashing gives equal lengths, which timingSafeEqual requires.
  const provided = req.get('x-webhook-secret') ?? ''
  if (!timingSafeEqual(sha256(provided), sha256(secret))) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
}
