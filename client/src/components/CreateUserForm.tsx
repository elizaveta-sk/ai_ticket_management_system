import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { createUserSchema, type CreateUserInput } from 'core/users'
import { serverErrorMessage } from '../lib/server-error-message.ts'
import UserForm from './UserForm.tsx'

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const queryClient = useQueryClient()
  const createUser = useMutation({
    mutationFn: (values: CreateUserInput) => axios.post('/api/users', values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] })
      onCreated()
    },
  })

  return (
    <UserForm
      schema={createUserSchema}
      defaultValues={{ name: '', email: '', password: '' }}
      submitLabel="Create user"
      pendingLabel="Creating..."
      isPending={createUser.isPending}
      errorMessage={
        createUser.isError ? serverErrorMessage(createUser.error, 'Could not create user') : undefined
      }
      onSubmit={(values) => createUser.mutate(values)}
    />
  )
}

export default CreateUserForm
