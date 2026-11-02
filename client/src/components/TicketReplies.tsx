import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { aiAgentName, createReplySchema, type CreateReplyInput, type TicketReply } from 'core/tickets'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { serverErrorMessage } from '../lib/server-error-message.ts'

const senderLabel = { customer: 'Customer', agent: 'Agent', ai: 'AI' } as const

function ReplyForm({ ticketId }: { ticketId: number }) {
  const queryClient = useQueryClient()
  const { control, handleSubmit, reset, setValue } = useForm<CreateReplyInput>({
    resolver: zodResolver(createReplySchema),
    defaultValues: { body: '' },
  })
  const addReply = useMutation({
    mutationFn: (values: CreateReplyInput) =>
      axios.post<{ emailFailed: boolean }>(`/api/tickets/${ticketId}/replies`, values),
    onSuccess: async () => {
      // Waits for the refreshed thread, so the reply never appears to vanish.
      await queryClient.invalidateQueries({ queryKey: ['ticket', String(ticketId)] })
      reset()
    },
  })
  const polishReply = useMutation({
    mutationFn: (values: CreateReplyInput) =>
      axios.post<{ body: string }>(`/api/tickets/${ticketId}/replies/polish`, values),
    onSuccess: ({ data }) => setValue('body', data.body, { shouldValidate: true }),
  })
  const isBusy = addReply.isPending || polishReply.isPending
  const isEmpty = !useWatch({ control, name: 'body' }).trim()

  return (
    <form
      onSubmit={handleSubmit((values) => {
        polishReply.reset()
        addReply.mutate(values)
      })}
      noValidate
    >
      <FieldGroup>
        <Controller
          name="body"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="reply-body">Your reply</FieldLabel>
              <Textarea
                {...field}
                id="reply-body"
                rows={4}
                // Read-only rather than disabled, so the cursor stays in the box while it sends.
                readOnly={isBusy}
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        {addReply.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              {serverErrorMessage(addReply.error, 'Could not send reply')}
            </AlertDescription>
          </Alert>
        )}
        {addReply.data?.data.emailFailed && (
          <Alert variant="destructive">
            <AlertDescription>
              Your reply was saved, but the email to the student could not be sent.
            </AlertDescription>
          </Alert>
        )}
        {polishReply.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              {serverErrorMessage(polishReply.error, 'Could not polish the reply')}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isBusy || isEmpty}
            onClick={handleSubmit((values) => {
              addReply.reset()
              polishReply.mutate(values)
            })}
          >
            {polishReply.isPending ? 'Polishing...' : 'Polish'}
          </Button>
          <Button type="submit" disabled={isBusy || isEmpty}>
            {addReply.isPending ? 'Sending...' : 'Send reply'}
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}

function TicketReplies({
  ticketId,
  senderName,
  replies,
}: {
  ticketId: number
  senderName: string
  replies: TicketReply[]
}) {
  return (
    <section aria-labelledby="replies-heading" className="mt-6">
      <h2 id="replies-heading" className="mb-3 text-lg font-semibold">
        Replies
      </h2>
      {replies.length === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">No replies yet.</p>
      ) : (
        <ol className="mb-4 space-y-3">
          {replies.map((reply) => (
            <li key={reply.id}>
              <Card>
                <CardContent>
                  <div className="mb-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium wrap-anywhere">
                        {reply.senderType === 'customer'
                          ? senderName
                          : reply.senderType === 'ai'
                            ? aiAgentName
                            : reply.author?.name}
                      </span>
                      <Badge variant={reply.senderType === 'customer' ? 'secondary' : 'outline'}>
                        {senderLabel[reply.senderType]}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground">
                      {new Date(reply.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <p className="wrap-anywhere whitespace-pre-wrap">{reply.body}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}
      <ReplyForm ticketId={ticketId} />
    </section>
  )
}

export default TicketReplies
