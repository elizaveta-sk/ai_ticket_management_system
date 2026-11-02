import { TicketStatus } from '../generated/prisma/client.ts'
import type { Ticket } from '../generated/prisma/client.ts'
import { autoResolveTicket } from './auto-resolve-ticket.ts'
import { classifyTicketInBackground } from './classify-ticket.ts'
import { isOpenAIConfigured } from './openai.ts'
import { prisma } from './prisma.ts'
import { handOverToAgents, startProcessing } from './ticket-state.ts'

// Without a model there's nothing to process, and the ticket should reach agents straight away.
export function initialTicketStatus() {
  return isOpenAIConfigured() ? TicketStatus.new : TicketStatus.open
}

// Call without awaiting, so that a new ticket never waits for the models. It never rejects.
// Moves the ticket from new to processing, assigned to the AI agent, and then either to resolved
// or to open and unassigned. A ticket that can't be classified isn't answered, because refund
// requests have to be recognised first.
export async function processTicketInBackground(ticket: Pick<Ticket, 'id' | 'subject' | 'body'>) {
  try {
    if (!(await startProcessing(ticket.id))) return

    const category = await classifyTicketInBackground(ticket)
    const resolved = category ? await autoResolveTicket(ticket, category) : false
    if (!resolved) await handOverToAgents(ticket.id)
  } catch (error) {
    // The sweep below moves the ticket on, so it can't stay hidden from agents.
    console.error(
      `Could not process ticket ${ticket.id}:`,
      error instanceof Error ? error.message : 'unknown error',
    )
  }
}

const sweepIntervalMs = 10 * 60_000
// Limits what a sweep can cost in model calls, for example after a long outage.
const sweepBatchSize = 20
// Longer than a classification can take with its retries, so a sweep doesn't repeat one
// that is still running.
const sweepMinAgeMs = 2 * 60_000
// Stops a ticket that always fails classification from being retried forever.
const sweepMaxAgeMs = 24 * 60 * 60_000
// Longer than processing can take, including every retry of both models.
const stuckProcessingMs = 10 * 60_000

// Recovers tickets that a restart or a failure left behind. It never rejects, and it handles
// tickets one at a time so that a backlog doesn't hit the models all at once.
export async function sweepTickets() {
  try {
    const now = Date.now()

    // These go to an agent rather than back through the AI, because the student may already
    // have been emailed an answer before the interruption.
    const stuck = await prisma.ticket.findMany({
      where: {
        status: TicketStatus.processing,
        updatedAt: { lte: new Date(now - stuckProcessingMs) },
      },
      select: { id: true },
    })
    for (const { id } of stuck) {
      await handOverToAgents(id)
    }

    const waiting = await prisma.ticket.findMany({
      where: { status: TicketStatus.new, createdAt: { lte: new Date(now - sweepMinAgeMs) } },
      select: { id: true, subject: true, body: true },
      orderBy: { createdAt: 'asc' },
      take: sweepBatchSize,
    })
    for (const ticket of waiting) {
      await processTicketInBackground(ticket)
    }

    if (!isOpenAIConfigured()) return

    // Agents can already see these, so this only fills in the category.
    const uncategorized = await prisma.ticket.findMany({
      where: {
        status: TicketStatus.open,
        category: null,
        createdAt: { gte: new Date(now - sweepMaxAgeMs), lte: new Date(now - sweepMinAgeMs) },
      },
      select: { id: true, subject: true, body: true },
      orderBy: { createdAt: 'asc' },
      take: sweepBatchSize,
    })
    for (const ticket of uncategorized) {
      await classifyTicketInBackground(ticket)
    }
  } catch (error) {
    console.error(
      'Could not sweep tickets:',
      error instanceof Error ? error.message : 'unknown error',
    )
  }
}

// Sweeps now and then repeatedly. The next sweep is only scheduled once the last one has
// finished, so they can't overlap.
export function startTicketSweep() {
  const sweep = async () => {
    await sweepTickets()
    setTimeout(sweep, sweepIntervalMs)
  }
  void sweep()
}
