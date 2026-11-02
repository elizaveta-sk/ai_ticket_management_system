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
import { aiAgentId } from 'core/tickets'
import DeleteUserDialog from './DeleteUserDialog.tsx'
import EditUserDialog from './EditUserDialog.tsx'

export type User = {
  id: string
  name: string
  email: string
  role: 'admin' | 'agent'
  createdAt: string
}

// Shows skeleton rows while isPending, and a row per user once loaded.
function UsersTable({ users, isPending }: { users?: User[]; isPending: boolean }) {
  return (
    <Table aria-busy={isPending}>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
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
              <TableCell>
                <Skeleton className="ml-auto h-7 w-15" />
              </TableCell>
            </TableRow>
          ))}
        {users?.map((user) => (
          <TableRow key={user.id}>
            <TableCell className="font-medium">{user.name}</TableCell>
            <TableCell>{user.email}</TableCell>
            <TableCell>
              <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>{user.role}</Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {new Date(user.createdAt).toLocaleDateString()}
            </TableCell>
            <TableCell>
              <div className="flex justify-end gap-1">
                <EditUserDialog user={user} />
                {/* Admins and the AI agent can't be deleted. The spacer keeps the edit buttons lined up. */}
                {user.role === 'admin' || user.id === aiAgentId ? (
                  <div className="size-7" />
                ) : (
                  <DeleteUserDialog user={user} />
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export default UsersTable
