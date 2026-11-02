import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import type { TicketDetail } from 'core/tickets'
import { X } from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import TicketControls from '../components/TicketControls.tsx'
import TicketMessage from '../components/TicketMessage.tsx'
import TicketReplies, { ReplyForm } from '../components/TicketReplies.tsx'
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

// The selected ticket, in a panel beside the list on the tickets page.
function TicketDetailPage() {
  const { id = '' } = useParams()
  const { search } = useLocation()
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
    <section
      aria-label="Selected ticket"
      className="flex min-h-0 min-w-0 flex-1 flex-col md:w-80 md:flex-none md:border-l lg:w-96 xl:w-120 2xl:w-xl"
    >
      <div className="flex shrink-0 items-start gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          {ticket && (
            <>
              <h2 className="text-base font-semibold wrap-anywhere">{ticket.subject}</h2>
              <p className="mt-1 wrap-anywhere">
                <span className="font-medium">{ticket.senderName}</span>{' '}
                <span className="text-muted-foreground">{ticket.senderEmail}</span>
              </p>
              <p className="text-muted-foreground">{new Date(ticket.createdAt).toLocaleString()}</p>
            </>
          )}
        </div>
        <Link
          to={{ pathname: '/tickets', search }}
          aria-label="Back to tickets"
          title="Back to tickets"
          className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
        >
          <X aria-hidden="true" />
        </Link>
      </div>
      {isError && (
        <Alert variant="destructive" className="m-4 w-auto">
          <AlertDescription>Could not load ticket</AlertDescription>
        </Alert>
      )}
      {ticket === null && <p className="p-4 text-muted-foreground">Ticket not found.</p>}
      {isPending && (
        <div data-testid="ticket-loading" className="space-y-4 p-4">
          <Skeleton className="h-5 w-64 max-w-full" />
          <Skeleton className="h-4 w-48 max-w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}
      {ticket && (
        // Keyed so nothing from one ticket, such as a summary or an error, carries over to another.
        <article key={ticket.id} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <TicketControls
              ticketId={ticket.id}
              status={ticket.status}
              category={ticket.category}
              assignedTo={ticket.assignedTo}
            />
            <div>
              <TicketMessage ticketId={ticket.id} body={ticket.body} />
            </div>
            <TicketReplies senderName={ticket.senderName} replies={ticket.replies} />
          </div>
          {/* Outside the scrolling area, so the reply box stays in view on a long thread. */}
          <div className="shrink-0 border-t p-4">
            <ReplyForm ticketId={ticket.id} />
          </div>
        </article>
      )}
    </section>
  )
}

export default TicketDetailPage
