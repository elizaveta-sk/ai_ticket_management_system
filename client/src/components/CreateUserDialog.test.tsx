import { fireEvent, screen, waitFor } from '@testing-library/react'
import axios, { AxiosError, type AxiosResponse } from 'axios'
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

describe('CreateUserDialog', () => {
  it('shows a button that opens a modal with name, email and password fields', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { users: [existingUser] } })

    renderWithQuery(<UsersPage />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await openDialog()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })

  it('shows validation errors and sends nothing when the form is invalid', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { users: [existingUser] } })
    const post = vi.spyOn(axios, 'post')

    renderWithQuery(<UsersPage />)
    await openDialog()
    fillForm({ name: 'Al', email: 'not-an-email', password: 'short' })
    submit()

    expect(await screen.findByText('Name must be at least 3 characters')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('rejects a name that is only long enough because of spaces', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { users: [existingUser] } })
    const post = vi.spyOn(axios, 'post')

    renderWithQuery(<UsersPage />)
    await openDialog()
    fillForm({ name: '  Al  ', email: 'alan@example.com', password: 'password123' })
    submit()

    expect(await screen.findByText('Name must be at least 3 characters')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('creates the user, closes the modal and shows the new user in the list', async () => {
    vi.spyOn(axios, 'get')
      .mockResolvedValueOnce({ data: { users: [existingUser] } })
      .mockResolvedValue({ data: { users: [existingUser, newUser] } })
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { user: newUser } })

    renderWithQuery(<UsersPage />)
    await screen.findByRole('cell', { name: 'Ada Admin' })
    await openDialog()
    fillForm({ name: newUser.name, email: newUser.email, password: 'password123' })
    submit()

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(post).toHaveBeenCalledWith('/api/users', {
      name: newUser.name,
      email: newUser.email,
      password: 'password123',
    })
    expect(screen.getByRole('cell', { name: 'Alan Agent' })).toBeInTheDocument()
  })

  it('keeps the modal open and shows the server error when creation fails', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { users: [existingUser] } })
    vi.spyOn(axios, 'post').mockRejectedValue(
      new AxiosError('Request failed', undefined, undefined, undefined, {
        status: 409,
        data: { error: 'A user with this email already exists' },
      } as AxiosResponse),
    )

    renderWithQuery(<UsersPage />)
    await openDialog()
    fillForm({ name: newUser.name, email: existingUser.email, password: 'password123' })
    submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A user with this email already exists',
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows a generic error when the server gives no message', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { users: [existingUser] } })
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('Network Error'))

    renderWithQuery(<UsersPage />)
    await openDialog()
    fillForm({ name: newUser.name, email: newUser.email, password: 'password123' })
    submit()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not create user')
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
    expect(screen.getByLabelText('Password')).toHaveValue('')
  })
})
