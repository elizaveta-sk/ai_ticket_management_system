import { ticketViews, type TicketView } from 'core/tickets'

export const defaultTicketView: TicketView = 'attention'

export const viewLabels: Record<TicketView, string> = {
  attention: 'Need attention',
  refunds: 'Refund requests',
  resolved: 'Resolved',
  closed: 'Closed',
  all: 'All tickets',
}

// An unknown view in the URL, such as from an old link, shows the default one.
export function parseTicketView(value: string | null): TicketView {
  return ticketViews.find((view) => view === value) ?? defaultTicketView
}

export function ticketViewHref(view: TicketView) {
  return view === defaultTicketView ? '/tickets' : `/tickets?view=${view}`
}

// Views of work still to do, where the ticket that has waited longest comes first.
export function viewSortsOldestFirst(view: TicketView) {
  return view === 'attention' || view === 'refunds'
}
