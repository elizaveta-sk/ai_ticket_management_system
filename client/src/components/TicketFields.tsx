import type { TicketCategory, TicketStatus } from 'core/tickets'
import { Badge } from '@/components/ui/badge'
import { categoryLabels, statusLabels, uncategorizedLabel } from '@/lib/ticket-labels'

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <Badge variant={status === 'open' ? 'outline' : 'secondary'}>{statusLabels[status]}</Badge>
  )
}

// A refund request still open is marked, because the AI never answers those.
export function TicketCategoryText({
  category,
  isOpen,
}: {
  category: TicketCategory | null
  isOpen: boolean
}) {
  if (!category) return <span className="text-muted-foreground">{uncategorizedLabel}</span>
  if (category === 'refund_request' && isOpen) {
    return <span className="font-medium text-destructive">{categoryLabels[category]}</span>
  }
  return categoryLabels[category]
}
