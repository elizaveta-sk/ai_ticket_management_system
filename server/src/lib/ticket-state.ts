import { Role, TicketStatus } from '../generated/prisma/client.ts'
import type { Prisma } from '../generated/prisma/client.ts'
import { aiAgentId } from './ai-agent.ts'
import { prisma } from './prisma.ts'

// The automatic part of a ticket's life: new -> processing -> open or resolved. Agents can
// move tickets freely after that through PATCH /api/tickets/:id, because a person's decision
// always wins.
const transitions: Partial<Record<TicketStatus, TicketStatus[]>> = {
  [TicketStatus.new]: [TicketStatus.processing],
  [TicketStatus.processing]: [TicketStatus.open, TicketStatus.resolved],
}

// The query alone, so that it can be part of a transaction. It only changes a ticket that is
// still in the from state, which means two callers can never make the same move.
export function moveTicketQuery(
  id: number,
  from: TicketStatus,
  to: TicketStatus,
  data: Prisma.TicketUpdateManyMutationInput = {},
) {
  if (!transitions[from]?.includes(to)) {
    throw new Error(`A ticket can't move from ${from} to ${to}`)
  }
  return prisma.ticket.updateMany({ where: { id, status: from }, data: { ...data, status: to } })
}

// Returns whether this call made the move.
export async function moveTicket(id: number, from: TicketStatus, to: TicketStatus) {
  const { count } = await moveTicketQuery(id, from, to)
  return count > 0
}

// Starts the AI's work on a new ticket, and returns whether this call did. A ticket still arrives
// unassigned if the AI agent hasn't been seeded, because a missing user mustn't stop it being
// processed. Only an unassigned ticket is taken, so an agent's assignment stays.
export async function startProcessing(id: number) {
  if (!(await moveTicket(id, TicketStatus.new, TicketStatus.processing))) return false

  const agent = await prisma.user.findFirst({
    where: { id: aiAgentId, deletedAt: null },
    select: { id: true },
  })
  if (agent) {
    await prisma.ticket.updateMany({
      where: { id, assignedToId: null },
      data: { assignedToId: aiAgentId },
    })
  } else {
    console.warn(`Ticket ${id} was not assigned, because the AI agent has not been seeded`)
  }
  return true
}

// The query alone, so that it can be part of a transaction. Leaves any other assignee in place.
export function unassignAiAgentQuery(id: number) {
  return prisma.ticket.updateMany({
    where: { id, assignedToId: aiAgentId },
    data: { assignedToId: null },
  })
}

// Lucy's account, which takes the tickets the AI couldn't resolve.
const defaultAgentEmail = 'lucy_agent@example.com'

// A missing account mustn't stop a ticket reaching the agents, so it only means the ticket
// arrives unassigned.
async function findDefaultAgentId() {
  const agent = await prisma.user.findFirst({
    where: { email: defaultAgentEmail, role: Role.agent, deletedAt: null },
    select: { id: true },
  })
  if (!agent) console.warn('Tickets stay unassigned, because the default agent account is missing')
  return agent?.id ?? null
}

// The AI couldn't resolve the ticket, so it goes to the default agent, or to nobody without one.
// Leaves any other assignee in place. A ticket can have no assignee here if the AI agent wasn't
// seeded, and that one goes to the default agent too.
export async function handOverToAgents(id: number) {
  const defaultAgentId = await findDefaultAgentId()
  await prisma.$transaction([
    moveTicketQuery(id, TicketStatus.processing, TicketStatus.open),
    defaultAgentId
      ? prisma.ticket.updateMany({
          where: { id, OR: [{ assignedToId: aiAgentId }, { assignedToId: null }] },
          data: { assignedToId: defaultAgentId },
        })
      : unassignAiAgentQuery(id),
  ])
}
