import { TicketStatus } from '../generated/prisma/client.ts'
import type { Prisma } from '../generated/prisma/client.ts'
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
