import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import type { TicketDetail } from 'core/tickets'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import TicketControls from '../components/TicketControls.tsx'
import TicketMessage from '../components/TicketMessage.tsx'
import TicketReplies from '../components/TicketReplies.tsx'
import { classificationRefetchInterval } from '../lib/classification-refetch.ts'
import { sanitizeText } from '../lib/sanitize-text.ts'

// Only for display: the original text stays unchanged in the database.
function sanitizeTicket(ticket: TicketDetail): TicketDetail {
  return {
    ...ticket,
    subject: sanitizeText(ticket.subject),
    senderName: sanitizeText(ticket.senderName),
    senderEmail: sanitizeText(ticket.senderEmail),
    body: sanitizeText(ticket.body),
    replies: ticket.replies.map((reply) => ({ ...reply, body: sanitizeText(reply.body) })),
  }
}

// Resolves to null when there is no such ticket, because retrying can't help then.
async function fetchTicket(id: string) {
  try {
    const res = await axios.get<{ ticket: TicketDetail }>(
      `/api/tickets/${encodeURIComponent(id)}`,
    )
    return sanitizeTicket(res.data.ticket)
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
    refetchInterval: (query) => {
      const current = query.state.data
      return classificationRefetchInterval(current ? [current] : undefined)
    },
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
        <article className="grid gap-6 md:grid-cols-[minmax(0,1fr)_16rem]">
          <div>
            <h1 className="mb-3 text-2xl font-bold wrap-anywhere">{ticket.subject}</h1>
            <div className="mb-4 text-sm">
              <div className="font-medium wrap-anywhere">{ticket.senderName}</div>
              <div className="text-muted-foreground wrap-anywhere">{ticket.senderEmail}</div>
              <div className="text-muted-foreground">
                {new Date(ticket.createdAt).toLocaleString()}
              </div>
            </div>
            {/* Keyed so a summary never carries over to another ticket. */}
            <TicketMessage key={ticket.id} ticketId={ticket.id} body={ticket.body} />
            <TicketReplies
              ticketId={ticket.id}
              senderName={ticket.senderName}
              replies={ticket.replies}
            />
          </div>
          <aside>
            <TicketControls
              ticketId={ticket.id}
              status={ticket.status}
              category={ticket.category}
              assignedTo={ticket.assignedTo}
            />
          </aside>
        </article>
      )}
    </main>
  )
}

export default TicketDetailPage
