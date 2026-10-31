import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { createUserSchema, type CreateUserInput } from 'core/users'
import { Controller, useForm } from 'react-hook-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DialogClose, DialogFooter } from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

function serverErrorMessage(error: unknown) {
  const message = axios.isAxiosError(error) ? error.response?.data?.error : undefined
  return typeof message === 'string' ? message : 'Could not create user'
}

// Render inside a dialog, which unmounts its content on close, so reopening
// always starts from an empty form and the password doesn't linger in state.
function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const queryClient = useQueryClient()
  const { control, handleSubmit } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: '', email: '', password: '' },
  })
  const createUser = useMutation({
    mutationFn: (values: CreateUserInput) => axios.post('/api/users', values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] })
      onCreated()
    },
  })

  return (
    <form onSubmit={handleSubmit((values) => createUser.mutate(values))} noValidate>
      <FieldGroup>
        <Controller
          name="name"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>Name</FieldLabel>
              <Input
                {...field}
                id={field.name}
                autoComplete="off"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="email"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>Email</FieldLabel>
              <Input
                {...field}
                id={field.name}
                type="email"
                autoComplete="off"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="password"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>Password</FieldLabel>
              <Input
                {...field}
                id={field.name}
                type="password"
                autoComplete="new-password"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        {createUser.isError && (
          <Alert variant="destructive">
            <AlertDescription>{serverErrorMessage(createUser.error)}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button type="submit" disabled={createUser.isPending}>
            {createUser.isPending ? 'Creating...' : 'Create user'}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}

export default CreateUserForm
