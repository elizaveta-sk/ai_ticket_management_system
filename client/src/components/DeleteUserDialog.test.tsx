import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import axios, { AxiosError, type AxiosResponse } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '../test/render-with-query.tsx'
import UsersPage from '../pages/UsersPage.tsx'

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

function mockUsers() {
  vi.spyOn(axios, 'get').mockResolvedValue({ data: { users: [admin, agent] } })
}

async function renderAndOpen() {
  renderWithQuery(<UsersPage />)
  fireEvent.click(await screen.findByRole('button', { name: `Delete ${agent.name}` }))
  return screen.findByRole('alertdialog')
}

function confirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
}

function serverError(error: unknown) {
  return new AxiosError('Request failed', undefined, undefined, undefined, {
    status: 403,
    data: { error },
  } as AxiosResponse)
}

describe('DeleteUserDialog', () => {
  it('shows a delete button for agents but not for the admin', async () => {
    mockUsers()

    renderWithQuery(<UsersPage />)

    const agentRow = (await screen.findByRole('cell', { name: agent.name })).closest('tr')!
    expect(
      within(agentRow).getByRole('button', { name: `Delete ${agent.name}` }),
    ).toBeInTheDocument()
    const adminRow = screen.getByRole('cell', { name: admin.name }).closest('tr')!
    expect(within(adminRow).queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument()
  })

  it('asks for confirmation, naming the user, before sending anything', async () => {
    mockUsers()
    const del = vi.spyOn(axios, 'delete')

    renderWithQuery(<UsersPage />)
    await screen.findByRole('cell', { name: agent.name })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: `Delete ${agent.name}` }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByRole('heading', { name: 'Delete user?' })).toBeInTheDocument()
    expect(within(dialog).getByText(new RegExp(agent.name))).toBeInTheDocument()
    expect(del).not.toHaveBeenCalled()
  })

  it('closes without sending anything when cancelled', async () => {
    mockUsers()
    const del = vi.spyOn(axios, 'delete')

    await renderAndOpen()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(del).not.toHaveBeenCalled()
    expect(screen.getByRole('cell', { name: agent.name })).toBeInTheDocument()
  })

  it('deletes the user, closes and removes the row when confirmed', async () => {
    vi.spyOn(axios, 'get')
      .mockResolvedValueOnce({ data: { users: [admin, agent] } })
      .mockResolvedValue({ data: { users: [admin] } })
    const del = vi.spyOn(axios, 'delete').mockResolvedValue({ status: 204 })

    await renderAndOpen()
    confirm()

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(del).toHaveBeenCalledWith('/api/users/2')
    expect(screen.queryByRole('cell', { name: agent.name })).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: admin.name })).toBeInTheDocument()
  })

  it('disables the delete button while the request is in progress', async () => {
    mockUsers()
    vi.spyOn(axios, 'delete').mockReturnValue(new Promise(() => {}))

    await renderAndOpen()
    confirm()

    expect(await screen.findByRole('button', { name: 'Deleting...' })).toBeDisabled()
  })

  it('stays open and shows the message from the server when deleting fails', async () => {
    mockUsers()
    vi.spyOn(axios, 'delete').mockRejectedValue(serverError('The admin account cannot be deleted'))

    await renderAndOpen()
    confirm()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The admin account cannot be deleted',
    )
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('shows a generic message when the request fails without a response', async () => {
    mockUsers()
    vi.spyOn(axios, 'delete').mockRejectedValue(new Error('Network Error'))

    await renderAndOpen()
    confirm()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete user')
  })

  it('does not show an old error after being cancelled and reopened', async () => {
    mockUsers()
    vi.spyOn(axios, 'delete').mockRejectedValue(new Error('Network Error'))

    await renderAndOpen()
    confirm()
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: `Delete ${agent.name}` }))
    await screen.findByRole('alertdialog')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
