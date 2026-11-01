import {
  createReplySchema,
  ticketIdSchema,
  ticketQuerySchema,
  updateTicketSchema,
} from 'core/tickets'
import { Router } from 'express'
import { Prisma, Role, SenderType } from '../generated/prisma/client.ts'
import { isPolishConfigured, polishReply } from '../lib/polish-reply.ts'
import { prisma } from '../lib/prisma.ts'
import { rateLimitPerUser } from '../middleware/rate-limit-per-user.ts'
import { requireAuth } from '../middleware/require-auth.ts'

const replySelect = {
  id: true,
  body: true,
  bodyHtml: true,
  senderType: true,
  createdAt: true,
  author: { select: { name: true } },
} as const

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
  // Oldest first, so the thread reads from the top. id breaks ties.
  replies: { select: replySelect, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.TicketSelect

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

const polishRateLimit = rateLimitPerUser(10, 60_000)

// Improves a draft reply without saving anything, addressed to the ticket's sender and
// signed by the signed-in user. Only the draft goes to the model, so nothing a student
// wrote can act as instructions to it.
ticketsRouter.post('/tickets/:id/replies/polish', requireAuth, polishRateLimit, async (req, res) => {
  const id = ticketIdSchema.safeParse(req.params.id)
  if (!id.success) {
    res.status(404).json({ error: 'Ticket not found' })
    return
  }
  const parsed = createReplySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  if (!isPolishConfigured()) {
    res.status(503).json({ error: 'Reply polishing is not configured' })
    return
  }
  const ticket = await prisma.ticket.findUnique({
    where: { id: id.data },
    select: { senderName: true },
  })
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' })
    return
  }

  try {
    // The same rules as sending, so a polished reply can always be sent.
    const polished = createReplySchema.safeParse({
      body: await polishReply(parsed.data.body, {
        customerName: ticket.senderName,
        agentName: req.user!.name,
      }),
    })
    if (polished.success) {
      res.json({ body: polished.data.body })
      return
    }
    console.error('Could not polish a reply: the model returned an unusable reply')
  } catch (error) {
    // Only the message, because the full error includes the draft.
    console.error('Could not polish a reply:', error instanceof Error ? error.message : 'unknown error')
  }
  res.status(502).json({ error: 'Could not polish the reply' })
})

// Admins and agents can both reply to any ticket, whatever its status. The reply is
// only stored for now: nothing emails it to the student until outbound email exists.
ticketsRouter.post('/tickets/:id/replies', requireAuth, async (req, res) => {
  const id = ticketIdSchema.safeParse(req.params.id)
  if (!id.success) {
    res.status(404).json({ error: 'Ticket not found' })
    return
  }
  const parsed = createReplySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  try {
    const reply = await prisma.ticketReply.create({
      data: {
        ticketId: id.data,
        senderType: SenderType.agent,
        authorId: req.user!.id,
        body: parsed.data.body,
      },
      select: replySelect,
    })
    res.status(201).json({ reply })
  } catch (error) {
    // The foreign key on ticketId: there is no such ticket.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      res.status(404).json({ error: 'Ticket not found' })
      return
    }
    throw error
  }
})
