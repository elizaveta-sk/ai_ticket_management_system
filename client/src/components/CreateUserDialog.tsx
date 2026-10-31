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
import CreateUserForm from './CreateUserForm.tsx'

function CreateUserDialog() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>New user</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New user</DialogTitle>
          <DialogDescription>Create an agent account.</DialogDescription>
        </DialogHeader>
        <CreateUserForm onCreated={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

export default CreateUserDialog
