import { randomUUID } from 'node:crypto'
import { contactFormSchema } from 'core/tickets'
import { Router } from 'express'
import { initialTicketStatus, processTicketInBackground } from '../lib/process-ticket.ts'
import { prisma } from '../lib/prisma.ts'
import { rateLimitTotal } from '../middleware/rate-limit-per-user.ts'

const minuteMs = 60_000

export const contactRouter = Router()

// Public, and every ticket costs a model call, so the limits also cap what spam can cost.
contactRouter.post(
  '/contact',
  rateLimitTotal(20, minuteMs),
  rateLimitTotal(500, 24 * 60 * minuteMs),
  async (req, res) => {
    const parsed = contactFormSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message })
      return
    }

    const { name, email, subject, message, website } = parsed.data
    // Looks like success, so a bot that filled in the trap has no reason to adapt.
    if (website) {
      res.status(201).json({ received: true })
      return
    }

    const ticket = await prisma.ticket.create({
      data: {
        // Each ticket needs a unique id, and a form submission has no email to take one from.
        messageId: `contact-${randomUUID()}`,
        senderEmail: email,
        senderName: name,
        subject,
        body: message,
        status: initialTicketStatus(),
      },
      select: { id: true, subject: true, body: true },
    })
    // The sender isn't an agent, so the ticket itself isn't returned.
    res.status(201).json({ received: true })
    // Not awaited: the sender has their answer and the category arrives once it's ready.
    void processTicketInBackground(ticket)
  },
)
