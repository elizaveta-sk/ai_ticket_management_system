import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate } from 'react-router'
import { z } from 'zod'
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
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  if (isPending) return <p className="loading">Loading...</p>
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
    <main className="login-page">
      <div className="login-card">
        <h1>Sign in</h1>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              {...register('email')}
            />
            {errors.email && (
              <p className="field-error" role="alert">
                {errors.email.message}
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              {...register('password')}
            />
            {errors.password && (
              <p className="field-error" role="alert">
                {errors.password.message}
              </p>
            )}
          </div>
          {errors.root?.server && (
            <p className="form-error" role="alert">
              {errors.root.server.message}
            </p>
          )}
          <button className="submit-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  )
}

export default LoginPage
