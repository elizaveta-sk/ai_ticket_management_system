import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { Alert, AlertDescription } from '@/components/ui/alert'
import CreateUserDialog from '../components/CreateUserDialog.tsx'
import UsersTable, { type User } from '../components/UsersTable.tsx'

async function fetchUsers() {
  const res = await axios.get<{ users: User[] }>('/api/users')
  return res.data.users
}

function UsersPage() {
  const { data: users, isPending, isError } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  })

  return (
    <main className="mx-auto max-w-240 p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Users</h1>
        <CreateUserDialog />
      </div>
      {isError && (
        <Alert variant="destructive">
          <AlertDescription>Could not load users</AlertDescription>
        </Alert>
      )}
      {users?.length === 0 && <p className="text-muted-foreground">No users found.</p>}
      {(isPending || (users && users.length > 0)) && (
        <UsersTable users={users} isPending={isPending} />
      )}
    </main>
  )
}

export default UsersPage
