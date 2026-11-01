import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TicketCategoryText, TicketStatusBadge } from '../components/TicketFields.tsx'
import type { Ticket } from '../components/TicketsTable.tsx'

type TicketDetail = Ticket & { body: string }

// Resolves to null when there is no such ticket, because retrying can't help then.
async function fetchTicket(id: string) {
  try {
    const res = await axios.get<{ ticket: TicketDetail }>(
      `/api/tickets/${encodeURIComponent(id)}`,
    )
    return res.data.ticket
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return null
    throw error
  }
}

function TicketDetailPage() {
  const { id = '' } = useParams()
  const {
    data: ticket,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => fetchTicket(id),
  })

  return (
    <main className="mx-auto max-w-240 p-6">
      <Link
        to="/tickets"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to tickets
      </Link>
      {isError && (
        <Alert variant="destructive">
          <AlertDescription>Could not load ticket</AlertDescription>
        </Alert>
      )}
      {ticket === null && <p className="text-muted-foreground">Ticket not found.</p>}
      {isPending && (
        <div data-testid="ticket-loading" className="space-y-4">
          <Skeleton className="h-8 w-96 max-w-full" />
          <Skeleton className="h-5 w-64 max-w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}
      {ticket && (
        <article>
          <h1 className="mb-3 text-2xl font-bold wrap-anywhere">{ticket.subject}</h1>
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <TicketStatusBadge status={ticket.status} />
            <span>
              <TicketCategoryText category={ticket.category} />
            </span>
          </div>
          <div className="mb-4 text-sm">
            <div className="font-medium wrap-anywhere">{ticket.senderName}</div>
            <div className="text-muted-foreground wrap-anywhere">{ticket.senderEmail}</div>
            <div className="text-muted-foreground">
              {new Date(ticket.createdAt).toLocaleString()}
            </div>
          </div>
          <Card>
            <CardContent>
              {ticket.body ? (
                // Emails are plain text, so keep their line breaks.
                <p className="wrap-anywhere whitespace-pre-wrap">{ticket.body}</p>
              ) : (
                <p className="text-muted-foreground">This email has no message.</p>
              )}
            </CardContent>
          </Card>
        </article>
      )}
    </main>
  )
}

export default TicketDetailPage
