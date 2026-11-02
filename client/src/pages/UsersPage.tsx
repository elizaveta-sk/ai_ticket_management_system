import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { Alert, AlertDescription } from '@/components/ui/alert'
import CreateUserDialog from '../components/CreateUserDialog.tsx'
import PageHeader from '../components/PageHeader.tsx'
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
    <main className="min-h-0 flex-1 overflow-y-auto">
      <PageHeader title="Users">
        <div className="ml-auto">
          <CreateUserDialog />
        </div>
      </PageHeader>
      {isError && (
        <Alert variant="destructive" className="m-4 w-auto">
          <AlertDescription>Could not load users</AlertDescription>
        </Alert>
      )}
      {users?.length === 0 && <p className="p-4 text-muted-foreground">No users found.</p>}
      {(isPending || (users && users.length > 0)) && (
        <UsersTable users={users} isPending={isPending} />
      )}
    </main>
  )
}

export default UsersPage
