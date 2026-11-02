import {
  createReplySchema,
  ticketIdSchema,
  ticketQuerySchema,
  type TicketStats,
  type TicketStatus,
  updateTicketSchema,
  visibleTicketStatus,
  visibleTicketStatuses,
} from 'core/tickets'
import { Router } from 'express'
import { Prisma, Role, SenderType } from '../generated/prisma/client.ts'
import { aiAgentId } from '../lib/ai-agent.ts'
import { isEmailConfigured, sendEmail } from '../lib/email.ts'
import { isOpenAIConfigured } from '../lib/openai.ts'
import { polishReply } from '../lib/polish-reply.ts'
import { prisma } from '../lib/prisma.ts'
import { replyAddressFor } from '../lib/reply-address.ts'
import { summarizeTicket } from '../lib/summarize-ticket.ts'
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
    // Tickets the AI answered need nothing from an agent, unless an agent reopens one.
    resolvedByAi: false,
    // Leaves out tickets the AI is still working on.
    status: status ?? { in: [...visibleTicketStatuses] },
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

// Before /tickets/:id, which would otherwise take "stats" as an id. Tickets the AI is still
// working on don't count yet, but tickets it resolved do, though they're not on the list.
ticketsRouter.get('/tickets/stats', requireAuth, async (_req, res) => {
  const [total, open, resolvedByAi, [average]] = await prisma.$transaction([
    prisma.ticket.count({ where: { status: { in: [...visibleTicketStatuses] } } }),
    prisma.ticket.count({ where: { status: 'open' } }),
    prisma.ticket.count({ where: { resolvedByAi: true } }),
    prisma.$queryRaw<{ seconds: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")))::float8 AS seconds
      FROM "ticket"
      WHERE "resolvedAt" IS NOT NULL`,
  ])
  const stats: TicketStats = {
    total,
    open,
    resolvedByAi,
    resolvedByAiPercent: total > 0 ? Math.round((resolvedByAi / total) * 1_000) / 10 : null,
    averageResolutionSeconds: average.seconds,
  }
  res.json({ stats })
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
  res.json({ ticket: { ...ticket, status: visibleTicketStatus(ticket.status) } })
})

async function resolutionChanges(id: number, status: TicketStatus | undefined) {
  // An agent moving an AI-resolved ticket on has taken it over, so it joins the list again.
  if (status === 'open') {
    const ticket = await prisma.ticket.findUnique({ where: { id }, select: { assignedToId: true } })
    return {
      resolvedByAi: false,
      resolvedAt: null,
      // The AI has finished with it, so nobody is working on it until an agent picks it up.
      ...(ticket?.assignedToId === aiAgentId && { assignedToId: null }),
    }
  }
  if (status === 'closed') return { resolvedByAi: false }
  if (status !== 'resolved') return {}

  // The first time counts, so saving a resolved ticket again doesn't change its resolution time.
  const ticket = await prisma.ticket.findUnique({ where: { id }, select: { resolvedAt: true } })
  return ticket?.resolvedAt ? {} : { resolvedAt: new Date() }
}

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

  const changes = parsed.data
  if (changes.assignedToId) {
    const agent = await prisma.user.findFirst({
      where: { id: { equals: changes.assignedToId, not: aiAgentId }, role: Role.agent, deletedAt: null },
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
      data: {
        // In this order, so that an assignee sent with the change is kept.
        ...(await resolutionChanges(id.data, changes.status)),
        ...changes,
      },
      select: ticketDetailSelect,
    })
    res.json({ ticket: { ...ticket, status: visibleTicketStatus(ticket.status) } })
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
  if (!isOpenAIConfigured()) {
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

const summaryRateLimit = rateLimitPerUser(10, 60_000)

// Summarizes the ticket and its replies. Generated on every request and never saved, so
// it always reflects the thread as it stands.
ticketsRouter.post('/tickets/:id/summary', requireAuth, summaryRateLimit, async (req, res) => {
  const id = ticketIdSchema.safeParse(req.params.id)
  if (!id.success) {
    res.status(404).json({ error: 'Ticket not found' })
    return
  }
  if (!isOpenAIConfigured()) {
    res.status(503).json({ error: 'Ticket summaries are not configured' })
    return
  }
  const ticket = await prisma.ticket.findUnique({
    where: { id: id.data },
    select: {
      subject: true,
      body: true,
      replies: {
        select: { senderType: true, body: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      },
    },
  })
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' })
    return
  }

  try {
    const summary = await summarizeTicket(ticket)
    if (summary) {
      res.json({ summary })
      return
    }
    console.error('Could not summarize a ticket: the model returned an unusable summary')
  } catch (error) {
    // Only the message, because the full error includes the ticket.
    console.error(
      'Could not summarize a ticket:',
      error instanceof Error ? error.message : 'unknown error',
    )
  }
  res.status(502).json({ error: 'Could not summarize the ticket' })
})

// Admins and agents can both reply to any ticket, whatever its status. The reply is saved and
// then emailed to the student.
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
    const { ticket, ...reply } = await prisma.ticketReply.create({
      data: {
        ticketId: id.data,
        senderType: SenderType.agent,
        authorId: req.user!.id,
        body: parsed.data.body,
      },
      select: { ...replySelect, ticket: { select: { senderEmail: true, subject: true } } },
    })

    // The reply stays saved if the email fails, and the agent is told so they can follow up.
    let emailFailed = false
    if (isEmailConfigured()) {
      try {
        await sendEmail({
          to: ticket.senderEmail,
          subject: `Re: ${ticket.subject}`,
          text: reply.body,
          replyTo: replyAddressFor(id.data),
        })
      } catch (error) {
        emailFailed = true
        console.error(
          `Could not email the reply on ticket ${id.data}:`,
          error instanceof Error ? error.message : 'unknown error',
        )
      }
    }
    res.status(201).json({ reply, emailFailed })
  } catch (error) {
    // The foreign key on ticketId: there is no such ticket.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      res.status(404).json({ error: 'Ticket not found' })
      return
    }
    throw error
  }
})
