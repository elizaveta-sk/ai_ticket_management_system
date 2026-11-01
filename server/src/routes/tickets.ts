import { ticketSortSchema } from 'core/tickets'
import { Router } from 'express'
import { prisma } from '../lib/prisma.ts'
import { requireAuth } from '../middleware/require-auth.ts'

export const ticketsRouter = Router()

// Admins and agents can both view tickets. id breaks ties, so tickets with the
// same value keep a stable order and reversing the sort reverses the whole list.
ticketsRouter.get('/tickets', requireAuth, async (req, res) => {
  const parsed = ticketSortSchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  const { sortBy, sortOrder } = parsed.data
  const tickets = await prisma.ticket.findMany({
    select: {
      id: true,
      subject: true,
      senderName: true,
      senderEmail: true,
      status: true,
      category: true,
      createdAt: true,
    },
    orderBy: [{ [sortBy]: sortOrder }, { id: sortOrder }],
  })
  res.json({ tickets })
})
