import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { serverErrorMessage } from '../lib/server-error-message.ts'
import type { User } from './UsersTable.tsx'

// Rendered inside the popup, which unmounts on close, so an old error doesn't
// come back when the dialog is reopened.
function DeleteUserConfirmation({ user, onDeleted }: { user: User; onDeleted: () => void }) {
  const queryClient = useQueryClient()
  const deleteUser = useMutation({
    mutationFn: () => axios.delete(`/api/users/${user.id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] })
      onDeleted()
    },
  })

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete user?</AlertDialogTitle>
        <AlertDialogDescription>
          {user.name} will be removed from this list and will no longer be able to sign in.
        </AlertDialogDescription>
      </AlertDialogHeader>
      {deleteUser.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {serverErrorMessage(deleteUser.error, 'Could not delete user')}
          </AlertDescription>
        </Alert>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          disabled={deleteUser.isPending}
          onClick={() => deleteUser.mutate()}
        >
          {deleteUser.isPending ? 'Deleting...' : 'Delete'}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}

function DeleteUserDialog({ user }: { user: User }) {
  const [open, setOpen] = useState(false)

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`Delete ${user.name}`} />}
      >
        <Trash2Icon />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <DeleteUserConfirmation user={user} onDeleted={() => setOpen(false)} />
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default DeleteUserDialog
