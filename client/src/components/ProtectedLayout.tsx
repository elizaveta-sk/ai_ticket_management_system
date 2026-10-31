import { Navigate, Outlet, useNavigate } from 'react-router'
import { authClient } from '../lib/auth-client.ts'

function ProtectedLayout() {
  const { data: session, isPending } = authClient.useSession()
  const navigate = useNavigate()

  if (isPending) return <p>Loading...</p>
  if (!session) return <Navigate to="/login" replace />

  async function handleSignOut() {
    await authClient.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <nav>
        <strong>AI Ticket Management System</strong> | <span>{session.user.name}</span>{' '}
        <button type="button" onClick={handleSignOut}>
          Sign out
        </button>
      </nav>
      <Outlet />
    </>
  )
}

export default ProtectedLayout
