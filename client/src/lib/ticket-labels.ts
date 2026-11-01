import type { TicketCategory, TicketStatus } from 'core/tickets'

export const statusLabels: Record<TicketStatus, string> = {
  open: 'Open',
  resolved: 'Resolved',
  closed: 'Closed',
}

export const categoryLabels: Record<TicketCategory, string> = {
  general_question: 'General Question',
  technical_question: 'Technical Question',
  refund_request: 'Refund Request',
}

export const uncategorizedLabel = 'Uncategorized'
