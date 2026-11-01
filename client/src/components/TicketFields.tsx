import type { TicketCategory, TicketStatus } from 'core/tickets'
import { Badge } from '@/components/ui/badge'
import { categoryLabels, statusLabels, uncategorizedLabel } from '@/lib/ticket-labels'

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <Badge variant={status === 'open' ? 'default' : 'secondary'}>{statusLabels[status]}</Badge>
  )
}

export function TicketCategoryText({ category }: { category: TicketCategory | null }) {
  return category ? (
    categoryLabels[category]
  ) : (
    <span className="text-muted-foreground">{uncategorizedLabel}</span>
  )
}
