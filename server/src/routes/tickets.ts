import { Router } from 'express'
import { prisma } from '../lib/prisma.ts'
import { requireAuth } from '../middleware/require-auth.ts'

export const ticketsRouter = Router()

// Admins and agents can both view tickets. Newest first; id breaks ties between
// tickets created in the same millisecond.
ticketsRouter.get('/tickets', requireAuth, async (_req, res) => {
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
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
  res.json({ tickets })
})
