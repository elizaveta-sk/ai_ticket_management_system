import { PencilIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import EditUserForm from './EditUserForm.tsx'
import type { User } from './UsersTable.tsx'

function EditUserDialog({ user }: { user: User }) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`Edit ${user.name}`} />}
      >
        <PencilIcon />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>Update this user's details.</DialogDescription>
        </DialogHeader>
        <EditUserForm user={user} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

export default EditUserDialog
