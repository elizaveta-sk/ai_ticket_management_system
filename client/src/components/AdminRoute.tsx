import { Navigate, Outlet } from 'react-router'
import { authClient } from '../lib/auth-client.ts'

// Nest under ProtectedLayout, which handles the loading and signed-out states.
function AdminRoute() {
  const { data: session } = authClient.useSession()

  if (session?.user.role !== 'admin') return <Navigate to="/" replace />

  return <Outlet />
}

export default AdminRoute
