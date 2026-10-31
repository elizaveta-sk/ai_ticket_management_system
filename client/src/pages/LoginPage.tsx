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

const labelClass = 'mb-1 block text-sm font-semibold'
const inputClass =
  'block w-full rounded-md border border-gray-300 px-2.75 py-2.25 focus:border-blue-600 focus:outline-2 focus:-outline-offset-1 focus:outline-blue-600 aria-[invalid=true]:border-red-700 aria-[invalid=true]:focus:outline-red-700'
const fieldErrorClass = 'mt-1 text-sm text-red-700'

function LoginPage() {
  const { data: session, isPending } = authClient.useSession()
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  if (isPending) return <p className="p-6 text-center text-gray-500">Loading...</p>
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
      <div className="w-full max-w-95 rounded-[10px] border border-gray-300 bg-white p-7">
        <h1 className="mb-4 text-2xl font-bold">Sign in</h1>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="mb-4">
            <label className={labelClass} htmlFor="email">
              Email
            </label>
            <input
              className={inputClass}
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              {...register('email')}
            />
            {errors.email && (
              <p className={fieldErrorClass} role="alert">
                {errors.email.message}
              </p>
            )}
          </div>
          <div className="mb-4">
            <label className={labelClass} htmlFor="password">
              Password
            </label>
            <input
              className={inputClass}
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              {...register('password')}
            />
            {errors.password && (
              <p className={fieldErrorClass} role="alert">
                {errors.password.message}
              </p>
            )}
          </div>
          {errors.root?.server && (
            <p className="mb-4 rounded-md bg-red-50 px-2.75 py-2.25 text-sm text-red-700" role="alert">
              {errors.root.server.message}
            </p>
          )}
          <button
            className="w-full cursor-pointer rounded-md border border-blue-600 bg-blue-600 px-3.5 py-2.5 font-semibold text-white enabled:hover:border-blue-700 enabled:hover:bg-blue-700 disabled:cursor-default disabled:opacity-60"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  )
}

export default LoginPage
