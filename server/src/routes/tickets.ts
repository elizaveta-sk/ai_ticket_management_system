import { ticketIdSchema, ticketQuerySchema, updateTicketSchema } from 'core/tickets'
import { Router } from 'express'
import { Prisma, Role } from '../generated/prisma/client.ts'
import { prisma } from '../lib/prisma.ts'
import { requireAuth } from '../middleware/require-auth.ts'

const ticketDetailSelect = {
  id: true,
  subject: true,
  senderName: true,
  senderEmail: true,
  status: true,
  category: true,
  createdAt: true,
  body: true,
  assignedTo: { select: { id: true, name: true } },
} as const

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
    ? await prisma.ticket.findUnique({ where: { id: id.data }, select: ticketDetailSelect })
    : null
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' })
    return
  }
  res.json({ ticket })
})

// Admins and agents can both update a ticket's status and category, and assign it
// to any active agent. Only the fields sent are changed.
ticketsRouter.patch('/tickets/:id', requireAuth, async (req, res) => {
  const id = ticketIdSchema.safeParse(req.params.id)
  if (!id.success) {
    res.status(404).json({ error: 'Ticket not found' })
    return
  }
  const parsed = updateTicketSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  const { status, category, assignedToId } = parsed.data
  if (assignedToId) {
    const agent = await prisma.user.findFirst({
      where: { id: assignedToId, role: Role.agent, deletedAt: null },
      select: { id: true },
    })
    if (!agent) {
      res.status(400).json({ error: 'That agent is no longer available' })
      return
    }
  }

  try {
    const ticket = await prisma.ticket.update({
      where: { id: id.data },
      data: { status, category, assignedToId },
      select: ticketDetailSelect,
    })
    res.json({ ticket })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ error: 'Ticket not found' })
      return
    }
    throw error
  }
})
