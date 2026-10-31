import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type User = {
  id: string
  name: string
  email: string
  role: 'admin' | 'agent'
  createdAt: string
}

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
      <h1 className="mb-4 text-2xl font-bold">Users</h1>
      {isError && (
        <Alert variant="destructive">
          <AlertDescription>Could not load users</AlertDescription>
        </Alert>
      )}
      {users?.length === 0 && <p className="text-muted-foreground">No users found.</p>}
      {(isPending || (users && users.length > 0)) && (
        <Table aria-busy={isPending}>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              ['first', 'second', 'third'].map((row) => (
                <TableRow key={row}>
                  <TableCell>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-44" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                </TableRow>
              ))}
            {users?.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                    {user.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(user.createdAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  )
}

export default UsersPage
