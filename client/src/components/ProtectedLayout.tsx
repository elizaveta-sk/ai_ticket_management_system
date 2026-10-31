import { useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, Outlet, useNavigate } from 'react-router'
import { authClient } from '../lib/auth-client.ts'

function ProtectedLayout() {
  const { data: session, isPending } = authClient.useSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  if (isPending) return <p className="p-6 text-center text-gray-500">Loading...</p>
  if (!session) return <Navigate to="/login" replace />

  async function handleSignOut() {
    await authClient.signOut()
    // Don't leave one user's cached data in memory for the next user of this tab.
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-300 bg-white px-6 py-3">
        <span className="mr-auto font-semibold">AI Ticket Management System</span>
        {session.user.role === 'admin' && (
          <Link className="hover:underline" to="/users">
            Users
          </Link>
        )}
        <span>{session.user.name}</span>
        <button
          className="cursor-pointer rounded-md border border-gray-300 bg-white px-3.5 py-2"
          type="button"
          onClick={handleSignOut}
        >
          Sign out
        </button>
      </nav>
      <Outlet />
    </>
  )
}

export default ProtectedLayout
