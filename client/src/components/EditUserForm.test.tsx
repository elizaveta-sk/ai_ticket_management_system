import { fireEvent, screen, waitFor } from '@testing-library/react'
import axios, { AxiosError, type AxiosResponse } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { authClient } from '../lib/auth-client.ts'
import { renderWithQuery } from '../test/render-with-query.tsx'
import EditUserForm from './EditUserForm.tsx'
import type { User } from './UsersTable.tsx'

vi.mock('../lib/auth-client.ts', () => ({ authClient: { useSession: vi.fn() } }))

const user: User = {
  id: 'user-2',
  name: 'Alan Agent',
  email: 'alan@example.com',
  role: 'agent',
  createdAt: '2026-02-20T12:00:00.000Z',
}
const refetchSession = vi.fn()

function signedInAs(id: string) {
  vi.mocked(authClient.useSession).mockReturnValue({
    data: { user: { id } },
    refetch: refetchSession,
  } as unknown as ReturnType<typeof authClient.useSession>)
}

// The form's Cancel button only works inside a dialog.
function renderForm() {
  const onSaved = vi.fn()
  renderWithQuery(
    <Dialog open>
      <DialogContent>
        <EditUserForm user={user} onSaved={onSaved} />
      </DialogContent>
    </Dialog>,
  )
  return { onSaved }
}

function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
}

function serverError(error: unknown) {
  return new AxiosError('Request failed', undefined, undefined, undefined, {
    status: 409,
    data: { error },
  } as AxiosResponse)
}

describe('EditUserForm', () => {
  beforeEach(() => {
    refetchSession.mockReset()
    signedInAs('admin-1')
  })

  it('starts with the user data and a blank, hidden password', () => {
    renderForm()

    expect(screen.getByLabelText('Name')).toHaveValue(user.name)
    expect(screen.getByLabelText('Email')).toHaveValue(user.email)
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.getByText('Leave blank to keep the current password.')).toBeInTheDocument()
  })

  describe('validation', () => {
    it.each([
      ['a 2 character name', 'Name', 'Al', 'Name must be at least 3 characters'],
      ['an invalid email', 'Email', 'not-an-email', 'Enter a valid email address'],
      ['a 7 character password', 'Password', 'a'.repeat(7), 'Password must be at least 8 characters'],
      ['a 129 character password', 'Password', 'a'.repeat(129), 'Password must be at most 128 characters'],
    ])('rejects %s', async (_label, field, value, message) => {
      const put = vi.spyOn(axios, 'put')
      renderForm()

      change(field, value)
      submit()

      expect(await screen.findByText(message)).toBeInTheDocument()
      expect(put).not.toHaveBeenCalled()
    })
  })

  describe('submitting', () => {
    it('sends a blank password when none is entered, which keeps the current one', async () => {
      const put = vi.spyOn(axios, 'put').mockResolvedValue({ data: {} })
      const { onSaved } = renderForm()

      change('Name', 'Alan Turing')
      submit()

      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
      expect(put).toHaveBeenCalledWith('/api/users/user-2', {
        name: 'Alan Turing',
        email: user.email,
        password: '',
      })
    })

    it('sends the new password when one is entered', async () => {
      const put = vi.spyOn(axios, 'put').mockResolvedValue({ data: {} })
      const { onSaved } = renderForm()

      change('Password', 'new-password')
      submit()

      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
      expect(put).toHaveBeenCalledWith('/api/users/user-2', {
        name: user.name,
        email: user.email,
        password: 'new-password',
      })
    })

    it('disables the submit button while the request is in progress', async () => {
      vi.spyOn(axios, 'put').mockReturnValue(new Promise(() => {}))
      const { onSaved } = renderForm()

      submit()

      expect(await screen.findByRole('button', { name: 'Saving...' })).toBeDisabled()
      expect(onSaved).not.toHaveBeenCalled()
    })

    it('refreshes the session when the signed-in user edits themselves', async () => {
      signedInAs(user.id)
      vi.spyOn(axios, 'put').mockResolvedValue({ data: {} })
      const { onSaved } = renderForm()

      submit()

      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
      expect(refetchSession).toHaveBeenCalledTimes(1)
    })

    it('does not refresh the session when editing someone else', async () => {
      vi.spyOn(axios, 'put').mockResolvedValue({ data: {} })
      const { onSaved } = renderForm()

      submit()

      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
      expect(refetchSession).not.toHaveBeenCalled()
    })
  })

  describe('server errors', () => {
    it('shows the message from the server and does not call onSaved', async () => {
      vi.spyOn(axios, 'put').mockRejectedValue(serverError('A user with this email already exists'))
      const { onSaved } = renderForm()

      submit()

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'A user with this email already exists',
      )
      expect(onSaved).not.toHaveBeenCalled()
    })

    it('shows a generic message when the request fails without a response', async () => {
      vi.spyOn(axios, 'put').mockRejectedValue(new Error('Network Error'))
      renderForm()

      submit()

      expect(await screen.findByRole('alert')).toHaveTextContent('Could not update user')
    })
  })
})
