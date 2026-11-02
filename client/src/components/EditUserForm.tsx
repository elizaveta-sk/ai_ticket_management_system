import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { aiAgentId } from 'core/tickets'
import { updateAiAgentSchema, updateUserSchema, type UpdateUserInput } from 'core/users'
import { authClient } from '../lib/auth-client.ts'
import { serverErrorMessage } from '../lib/server-error-message.ts'
import UserForm from './UserForm.tsx'
import type { User } from './UsersTable.tsx'

function EditUserForm({ user, onSaved }: { user: User; onSaved: () => void }) {
  // The AI agent can only be renamed.
  const isAiAgent = user.id === aiAgentId
  const queryClient = useQueryClient()
  const { data: session, refetch: refetchSession } = authClient.useSession()
  const updateUser = useMutation({
    mutationFn: (values: UpdateUserInput) => axios.put(`/api/users/${user.id}`, isAiAgent ? { name: values.name } : values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] })
      // The page header shows the signed-in user's name from the session.
      if (session?.user.id === user.id) await refetchSession()
      onSaved()
    },
  })

  return (
    <UserForm
      schema={isAiAgent ? updateAiAgentSchema : updateUserSchema}
      nameOnly={isAiAgent}
      defaultValues={{ name: user.name, email: user.email, password: '' }}
      passwordDescription="Leave blank to keep the current password."
      submitLabel="Save changes"
      pendingLabel="Saving..."
      isPending={updateUser.isPending}
      errorMessage={
        updateUser.isError ? serverErrorMessage(updateUser.error, 'Could not update user') : undefined
      }
      onSubmit={(values) => updateUser.mutate(values)}
    />
  )
}

export default EditUserForm
