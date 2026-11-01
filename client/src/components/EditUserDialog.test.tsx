import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import axios from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authClient } from '../lib/auth-client.ts'
import { renderWithQuery } from '../test/render-with-query.tsx'
import UsersPage from '../pages/UsersPage.tsx'

vi.mock('../lib/auth-client.ts', () => ({ authClient: { useSession: vi.fn() } }))

const admin = {
  id: '1',
  name: 'Ada Admin',
  email: 'ada@example.com',
  role: 'admin',
  createdAt: '2026-01-15T12:00:00.000Z',
}
const agent = {
  id: '2',
  name: 'Alan Agent',
  email: 'alan@example.com',
  role: 'agent',
  createdAt: '2026-02-20T12:00:00.000Z',
}

async function renderAndOpen(name: string) {
  renderWithQuery(<UsersPage />)
  fireEvent.click(await screen.findByRole('button', { name: `Edit ${name}` }))
  return screen.findByRole('dialog')
}

// The form's own behaviour is covered in EditUserForm.test.tsx.
describe('EditUserDialog', () => {
  beforeEach(() => {
    vi.mocked(authClient.useSession).mockReturnValue({
      data: { user: { id: admin.id } },
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof authClient.useSession>)
  })

  it('shows an edit button on each row and no dialog until one is clicked', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { users: [admin, agent] } })

    renderWithQuery(<UsersPage />)

    for (const user of [admin, agent]) {
      const row = (await screen.findByRole('cell', { name: user.name })).closest('tr')!
      expect(within(row).getByRole('button', { name: `Edit ${user.name}` })).toBeInTheDocument()
    }
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens with the data of the clicked user', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { users: [admin, agent] } })

    const dialog = await renderAndOpen(agent.name)

    expect(within(dialog).getByRole('heading', { name: 'Edit user' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue(agent.name)
    expect(screen.getByLabelText('Email')).toHaveValue(agent.email)
    expect(screen.getByLabelText('Password')).toHaveValue('')
  })

  it('closes and shows the new values in the list after saving', async () => {
    vi.spyOn(axios, 'get')
      .mockResolvedValueOnce({ data: { users: [admin, agent] } })
      .mockResolvedValue({ data: { users: [admin, { ...agent, name: 'Alan Turing' }] } })
    vi.spyOn(axios, 'put').mockResolvedValue({ data: {} })

    await renderAndOpen(agent.name)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alan Turing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('cell', { name: 'Alan Turing' })).toBeInTheDocument()
  })

  it('stays open when saving fails', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { users: [agent] } })
    vi.spyOn(axios, 'put').mockRejectedValue(new Error('Network Error'))

    await renderAndOpen(agent.name)
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await screen.findByRole('alert')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('discards edits when cancelled and reopened', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { users: [agent] } })

    await renderAndOpen(agent.name)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Someone Else' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'new-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: `Edit ${agent.name}` }))
    await screen.findByRole('dialog')

    expect(screen.getByLabelText('Name')).toHaveValue(agent.name)
    expect(screen.getByLabelText('Password')).toHaveValue('')
  })
})
