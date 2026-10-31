import { screen, within } from '@testing-library/react'
import axios from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '../test/render-with-query.tsx'
import UsersPage from './UsersPage.tsx'

const users = [
  {
    id: '1',
    name: 'Ada Admin',
    email: 'ada@example.com',
    role: 'admin',
    createdAt: '2026-01-15T12:00:00.000Z',
  },
  {
    id: '2',
    name: 'Alan Agent',
    email: 'alan@example.com',
    role: 'agent',
    createdAt: '2026-02-20T12:00:00.000Z',
  },
]

describe('UsersPage', () => {
  it('shows the table headers and skeleton rows while loading', () => {
    vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))

    const { container } = renderWithQuery(<UsersPage />)

    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true')
    for (const name of ['Name', 'Email', 'Role', 'Created']) {
      expect(screen.getByRole('columnheader', { name })).toBeInTheDocument()
    }
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it('requests /api/users and shows a row for each user', async () => {
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { users } })

    const { container } = renderWithQuery(<UsersPage />)

    const adminRow = (await screen.findByRole('cell', { name: 'Ada Admin' })).closest('tr')!
    expect(within(adminRow).getByText('ada@example.com')).toBeInTheDocument()
    expect(within(adminRow).getByText('admin')).toBeInTheDocument()
    expect(
      within(adminRow).getByText(new Date(users[0].createdAt).toLocaleDateString()),
    ).toBeInTheDocument()

    const agentRow = screen.getByRole('cell', { name: 'Alan Agent' }).closest('tr')!
    expect(within(agentRow).getByText('alan@example.com')).toBeInTheDocument()
    expect(within(agentRow).getByText('agent')).toBeInTheDocument()

    expect(get).toHaveBeenCalledWith('/api/users')
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'false')
    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeInTheDocument()
  })

  it('shows an empty message and no table when there are no users', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { users: [] } })

    renderWithQuery(<UsersPage />)

    expect(await screen.findByText('No users found.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows an error and no table when the request fails', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(new Error('Request failed with status code 403'))

    renderWithQuery(<UsersPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load users')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
