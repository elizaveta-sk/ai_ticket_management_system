import type { TicketCategory, TicketStatus } from 'core/tickets'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export type Ticket = {
  id: number
  subject: string
  senderName: string
  senderEmail: string
  status: TicketStatus
  category: TicketCategory | null
  createdAt: string
}

const statusLabels: Record<TicketStatus, string> = {
  open: 'Open',
  resolved: 'Resolved',
  closed: 'Closed',
}

const categoryLabels: Record<TicketCategory, string> = {
  general_question: 'General Question',
  technical_question: 'Technical Question',
  refund_request: 'Refund Request',
}

// Shows skeleton rows while isPending, and a row per ticket once loaded.
function TicketsTable({ tickets, isPending }: { tickets?: Ticket[]; isPending: boolean }) {
  return (
    <Table aria-busy={isPending}>
      <TableHeader>
        <TableRow>
          <TableHead>Subject</TableHead>
          <TableHead>Sender</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending &&
          ['first', 'second', 'third'].map((row) => (
            <TableRow key={row}>
              <TableCell>
                <Skeleton className="h-4 w-56" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-8 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-14 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-28" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-32" />
              </TableCell>
            </TableRow>
          ))}
        {tickets?.map((ticket) => (
          <TableRow key={ticket.id}>
            <TableCell className="max-w-72 truncate font-medium">{ticket.subject}</TableCell>
            <TableCell>
              <div>{ticket.senderName}</div>
              <div className="text-muted-foreground">{ticket.senderEmail}</div>
            </TableCell>
            <TableCell>
              <Badge variant={ticket.status === 'open' ? 'default' : 'secondary'}>
                {statusLabels[ticket.status]}
              </Badge>
            </TableCell>
            <TableCell className={ticket.category ? undefined : 'text-muted-foreground'}>
              {ticket.category ? categoryLabels[ticket.category] : 'Uncategorized'}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {new Date(ticket.createdAt).toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export default TicketsTable
