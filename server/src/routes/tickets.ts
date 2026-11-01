import { ticketIdSchema, ticketQuerySchema } from 'core/tickets'
import { Router } from 'express'
import type { Prisma } from '../generated/prisma/client.ts'
import { prisma } from '../lib/prisma.ts'
import { requireAuth } from '../middleware/require-auth.ts'

export const ticketsRouter = Router()

// Admins and agents can both view tickets. id breaks ties, so tickets with the
// same value keep a stable order and reversing the sort reverses the whole list.
ticketsRouter.get('/tickets', requireAuth, async (req, res) => {
  const parsed = ticketQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  const { sortBy, sortOrder, status, category, search, page, pageSize } = parsed.data
  // contains becomes a LIKE pattern, so % and _ would otherwise act as wildcards.
  const contains = {
    contains: search?.replace(/[\\%_]/g, '\\$&'),
    mode: 'insensitive',
  } as const
  const where: Prisma.TicketWhereInput = {
    status,
    category: category === 'uncategorized' ? null : category,
    // Only what the table shows, so every result visibly matches the search.
    OR: search
      ? [{ subject: contains }, { senderName: contains }, { senderEmail: contains }]
      : undefined,
  }
  // In one transaction, so the total always describes the same data as the page.
  const [tickets, total] = await prisma.$transaction([
    prisma.ticket.findMany({
      where,
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
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ticket.count({ where }),
  ])
  res.json({ tickets, total })
})

// An id that could never exist gets the same answer as one that doesn't.
ticketsRouter.get('/tickets/:id', requireAuth, async (req, res) => {
  const id = ticketIdSchema.safeParse(req.params.id)
  const ticket = id.success
    ? await prisma.ticket.findUnique({
        where: { id: id.data },
        select: {
          id: true,
          subject: true,
          senderName: true,
          senderEmail: true,
          status: true,
          category: true,
          createdAt: true,
          body: true,
        },
      })
    : null
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' })
    return
  }
  res.json({ ticket })
})
