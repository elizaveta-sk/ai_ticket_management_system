import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import axios from 'axios'
import { contactFormSchema, type ContactFormInput, type ContactFormValues } from 'core/tickets'
import { Controller, useForm } from 'react-hook-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { serverErrorMessage } from '../lib/server-error-message.ts'

const emptyForm: ContactFormInput = { name: '', email: '', subject: '', message: '', website: '' }

function ContactPage() {
  const { control, handleSubmit, reset } = useForm<ContactFormInput, unknown, ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: emptyForm,
  })
  const sendMessage = useMutation({
    mutationFn: (values: ContactFormValues) => axios.post('/api/contact', values),
    onSuccess: () => reset(emptyForm),
  })

  return (
    <main className="flex justify-center px-4 py-16">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <h1 className="text-2xl font-bold">Contact support</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sendMessage.isSuccess ? (
            <div className="flex flex-col gap-4">
              <p role="status">Thanks, we've received your message.</p>
              <Button className="w-full" variant="outline" onClick={() => sendMessage.reset()}>
                Send another message
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit((values) => sendMessage.mutate(values))} noValidate>
              <FieldGroup>
                <Controller
                  name="name"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                      <Input
                        {...field}
                        id={field.name}
                        autoComplete="name"
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
                <Controller
                  name="email"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                      <Input
                        {...field}
                        id={field.name}
                        type="email"
                        autoComplete="email"
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
                <Controller
                  name="subject"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={field.name}>Subject</FieldLabel>
                      <Input {...field} id={field.name} aria-invalid={fieldState.invalid} />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
                <Controller
                  name="message"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={field.name}>Message</FieldLabel>
                      <Textarea
                        {...field}
                        id={field.name}
                        rows={6}
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
                {/* The spam trap: hidden from people, but bots fill in every field they find. */}
                <div className="sr-only" aria-hidden="true">
                  <Controller
                    name="website"
                    control={control}
                    render={({ field }) => (
                      <>
                        <label htmlFor={field.name}>Website</label>
                        <Input {...field} id={field.name} tabIndex={-1} autoComplete="off" />
                      </>
                    )}
                  />
                </div>
                {sendMessage.isError && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {serverErrorMessage(sendMessage.error, 'Could not send your message')}
                    </AlertDescription>
                  </Alert>
                )}
                <Button className="w-full" type="submit" disabled={sendMessage.isPending}>
                  {sendMessage.isPending ? 'Sending...' : 'Send message'}
                </Button>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

export default ContactPage
