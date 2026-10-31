import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { Navigate, useNavigate } from 'react-router'
import { z } from 'zod'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { authClient } from '../lib/auth-client.ts'

const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})

type LoginValues = z.infer<typeof loginSchema>

function LoginPage() {
  const { data: session, isPending } = authClient.useSession()
  const navigate = useNavigate()
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  if (isPending) {
    return (
      <main className="flex justify-center px-4 py-16">
        <Card className="w-full max-w-sm" role="status" aria-label="Loading">
          <CardHeader>
            <Skeleton className="h-8 w-28" />
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </CardContent>
        </Card>
      </main>
    )
  }
  if (session) return <Navigate to="/" replace />

  async function onSubmit(values: LoginValues) {
    const { error } = await authClient.signIn.email(values)

    if (error) {
      setError('root.server', { message: error.message ?? 'Could not sign in' })
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <main className="flex justify-center px-4 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1 className="text-2xl font-bold">Sign in</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
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
                name="password"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                    <Input
                      {...field}
                      id={field.name}
                      type="password"
                      autoComplete="current-password"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              {errors.root?.server && (
                <Alert variant="destructive">
                  <AlertDescription>{errors.root.server.message}</AlertDescription>
                </Alert>
              )}
              <Button className="w-full" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Signing in...' : 'Sign in'}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}

export default LoginPage
