import { useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, Outlet, useNavigate } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { authClient } from '../lib/auth-client.ts'

function ProtectedLayout() {
  const { data: session, isPending } = authClient.useSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  if (isPending) {
    return (
      <div role="status" aria-label="Loading">
        <div className="flex items-center gap-4 border-b border-border px-6 py-3">
          <Skeleton className="mr-auto h-5 w-56" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-9 w-20" />
        </div>
        <div className="mx-auto max-w-240 p-6">
          <Skeleton className="h-8 w-32" />
        </div>
      </div>
    )
  }
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
        <Link className="mr-auto font-semibold hover:underline" to="/">
          AI Ticket Management System
        </Link>
        <Link className="hover:underline" to="/tickets">
          Tickets
        </Link>
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
