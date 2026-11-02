import { useMutation } from '@tanstack/react-query'
import axios from 'axios'
import { Sparkles } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { sanitizeText } from '../lib/sanitize-text.ts'
import { serverErrorMessage } from '../lib/server-error-message.ts'

// The ticket's original email, with a summary of the whole thread on request. A mutation
// rather than a query, so that every click generates a new summary and nothing is cached.
function TicketMessage({ ticketId, body }: { ticketId: number; body: string }) {
  const summarize = useMutation({
    mutationFn: () => axios.post<{ summary: string }>(`/api/tickets/${ticketId}/summary`),
  })

  return (
    <>
      <Card size="sm">
        <CardContent>
          {body ? (
            // Emails are plain text, so keep their line breaks.
            <p className="wrap-anywhere whitespace-pre-wrap">{body}</p>
          ) : (
            <p className="text-muted-foreground">This email has no message.</p>
          )}
        </CardContent>
      </Card>
      <div className="mt-2 flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={summarize.isPending}
          onClick={() => summarize.mutate()}
        >
          <Sparkles aria-hidden="true" />
          {summarize.isPending ? 'Summarizing...' : 'Summarize'}
        </Button>
      </div>
      {summarize.isPending && (
        <div data-testid="summary-loading" className="mt-4 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}
      {summarize.isError && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>
            {serverErrorMessage(summarize.error, 'Could not summarize the ticket')}
          </AlertDescription>
        </Alert>
      )}
      {summarize.isSuccess && (
        <Card size="sm" className="mt-4" role="region" aria-labelledby="summary-heading">
          <CardContent>
            <h3 id="summary-heading" className="mb-2 text-sm font-semibold">
              Summary
            </h3>
            <p className="wrap-anywhere whitespace-pre-wrap">
              {sanitizeText(summarize.data.data.summary)}
            </p>
          </CardContent>
        </Card>
      )}
    </>
  )
}

export default TicketMessage
