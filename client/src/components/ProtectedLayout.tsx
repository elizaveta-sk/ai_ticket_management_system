import { useQueryClient } from '@tanstack/react-query'
import { Navigate, Outlet, useNavigate } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { authClient } from '../lib/auth-client.ts'
import AppSidebar from './AppSidebar.tsx'

function ProtectedLayout() {
  const { data: session, isPending } = authClient.useSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  if (isPending) {
    return (
      <div role="status" aria-label="Loading" className="flex min-h-dvh flex-col md:flex-row">
        <div className="flex flex-col gap-2 border-b bg-sidebar p-4 md:w-56 md:border-r md:border-b-0">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="flex-1 p-4">
          <Skeleton className="h-5 w-32" />
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
    // On wider screens the page stays still and each area scrolls by itself.
    <div className="flex min-h-dvh flex-col md:h-dvh md:flex-row">
      <AppSidebar
        userName={session.user.name}
        isAdmin={session.user.role === 'admin'}
        onSignOut={handleSignOut}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  )
}

export default ProtectedLayout
