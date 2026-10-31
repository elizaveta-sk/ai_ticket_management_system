import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { authClient } from '../lib/auth-client.ts'

function LoginPage() {
  const { data: session, isPending } = authClient.useSession()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (isPending) return <p>Loading...</p>
  if (session) return <Navigate to="/" replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    const { error } = await authClient.signIn.email({ email, password })

    setSubmitting(false)
    if (error) {
      setError(error.message ?? 'Could not sign in')
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <main>
      <h1>Sign in</h1>
      <form onSubmit={handleSubmit}>
        <p>
          <label>
            Email{' '}
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
        </p>
        <p>
          <label>
            Password{' '}
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        </p>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}

export default LoginPage
