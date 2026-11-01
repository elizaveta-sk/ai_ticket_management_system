import { inboundEmailSchema } from 'core/tickets'
import express, { Router } from 'express'
import { Prisma } from '../generated/prisma/client.ts'
import { classifyTicketInBackground } from '../lib/classify-ticket.ts'
import { prisma } from '../lib/prisma.ts'
import { requireWebhookSecret } from '../middleware/require-webhook-secret.ts'

const ticketSelect = { id: true, status: true, category: true } as const

export const webhooksRouter = Router()

// Emails can be longer than the app-wide body limit of 100kb. The secret is
// checked first so unauthenticated requests never get their body parsed.
webhooksRouter.post(
  '/inbound-email',
  requireWebhookSecret,
  express.json({ limit: '1mb' }),
  async (req, res) => {
    const parsed = inboundEmailSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message })
      return
    }

    const { messageId, from, fromName, subject, text } = parsed.data
    try {
      const ticket = await prisma.ticket.create({
        data: { messageId, senderEmail: from, senderName: fromName, subject, body: text },
        select: ticketSelect,
      })
      res.status(201).json({ ticket })
      // Not awaited: the sender has its answer and the category arrives once it's ready.
      void classifyTicketInBackground({ id: ticket.id, subject, body: text })
    } catch (error) {
      // Webhooks get retried. A 2xx tells the sender to stop, without a second ticket.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const ticket = await prisma.ticket.findUnique({
          where: { messageId },
          select: ticketSelect,
        })
        res.status(200).json({ ticket })
        return
      }
      throw error
    }
  },
)
