import { fireEvent, screen, waitFor } from '@testing-library/react'
import axios from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '../test/render-with-query.tsx'
import UsersPage from '../pages/UsersPage.tsx'

const existingUser = {
  id: '1',
  name: 'Ada Admin',
  email: 'ada@example.com',
  role: 'admin',
  createdAt: '2026-01-15T12:00:00.000Z',
}
const newUser = {
  id: '2',
  name: 'Alan Agent',
  email: 'alan@example.com',
  role: 'agent',
  createdAt: '2026-02-20T12:00:00.000Z',
}

async function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'New user' }))
  return screen.findByRole('dialog')
}

function fillForm(values: { name: string; email: string; password: string }) {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: values.name } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: values.email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: values.password } })
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Create user' }))
}

// The form's own behaviour is covered in CreateUserForm.test.tsx.
describe('CreateUserDialog', () => {
  it('closes and shows the new user in the list after creating them', async () => {
    vi.spyOn(axios, 'get')
      .mockResolvedValueOnce({ data: { users: [existingUser] } })
      .mockResolvedValue({ data: { users: [existingUser, newUser] } })
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { user: newUser } })

    renderWithQuery(<UsersPage />)
    await screen.findByRole('cell', { name: 'Ada Admin' })
    await openDialog()
    fillForm({ name: newUser.name, email: newUser.email, password: 'password123' })
    submit()

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('cell', { name: 'Alan Agent' })).toBeInTheDocument()
  })

  it('stays open when the form is invalid', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { users: [existingUser] } })

    renderWithQuery(<UsersPage />)
    await openDialog()
    submit()

    await screen.findByText('Name must be at least 3 characters')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('stays open when creating the user fails', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { users: [existingUser] } })
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('Network Error'))

    renderWithQuery(<UsersPage />)
    await openDialog()
    fillForm({ name: newUser.name, email: newUser.email, password: 'password123' })
    submit()

    await screen.findByRole('alert')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('starts with an empty form after being cancelled and reopened', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { users: [existingUser] } })

    renderWithQuery(<UsersPage />)
    await openDialog()
    fillForm({ name: newUser.name, email: newUser.email, password: 'password123' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await openDialog()
    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.getByLabelText('Email')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveValue('')
  })
})
