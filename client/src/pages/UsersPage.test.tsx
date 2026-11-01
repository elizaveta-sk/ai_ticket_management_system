import { fireEvent, screen, waitFor, within } from '@testing-library/react'
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

  describe('new user dialog', () => {
    async function renderWithOpenDialog() {
      vi.spyOn(axios, 'get').mockResolvedValue({ data: { users } })
      renderWithQuery(<UsersPage />)
      fireEvent.click(screen.getByRole('button', { name: 'New user' }))
      return screen.findByRole('dialog')
    }

    it('is hidden until the button is clicked', async () => {
      vi.spyOn(axios, 'get').mockResolvedValue({ data: { users } })

      renderWithQuery(<UsersPage />)

      await screen.findByRole('cell', { name: 'Ada Admin' })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'New user' }))

      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('heading', { name: 'New user' })).toBeInTheDocument()
    })

    it('hides when clicking outside it', async () => {
      await renderWithOpenDialog()

      // The overlay covers the page, so it is what a click outside the dialog lands on.
      const overlay = document.querySelector('[data-slot="dialog-overlay"]')!
      fireEvent.pointerDown(overlay)
      fireEvent.mouseDown(overlay)
      fireEvent.pointerUp(overlay)
      fireEvent.mouseUp(overlay)
      fireEvent.click(overlay)

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('hides when pressing Escape', async () => {
      const dialog = await renderWithOpenDialog()

      fireEvent.keyDown(dialog, { key: 'Escape' })

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })
  })
})
