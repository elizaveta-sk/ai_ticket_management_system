import { screen, within } from '@testing-library/react'
import axios from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '../test/render-with-query.tsx'
import TicketsPage from './TicketsPage.tsx'

const tickets = [
  {
    id: 2,
    subject: 'Refund for my course',
    senderName: 'Grace Student',
    senderEmail: 'grace@example.com',
    status: 'resolved',
    category: 'refund_request',
    createdAt: '2026-03-02T12:00:00.000Z',
  },
  {
    id: 1,
    subject: 'Cannot access my course',
    senderName: 'Alan Student',
    senderEmail: 'alan@example.com',
    status: 'open',
    category: null,
    createdAt: '2026-03-01T12:00:00.000Z',
  },
]

describe('TicketsPage', () => {
  it('shows the table headers and skeleton rows while loading', () => {
    vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))

    const { container } = renderWithQuery(<TicketsPage />)

    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true')
    for (const name of ['Subject', 'Sender', 'Status', 'Category', 'Created']) {
      expect(screen.getByRole('columnheader', { name })).toBeInTheDocument()
    }
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it('requests /api/tickets and shows a row for each ticket with readable labels', async () => {
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets } })

    const { container } = renderWithQuery(<TicketsPage />)

    const row = (await screen.findByRole('cell', { name: tickets[0].subject })).closest('tr')!
    expect(within(row).getByText('Grace Student')).toBeInTheDocument()
    expect(within(row).getByText('grace@example.com')).toBeInTheDocument()
    expect(within(row).getByText('Resolved')).toBeInTheDocument()
    expect(within(row).getByText('Refund Request')).toBeInTheDocument()
    expect(
      within(row).getByText(new Date(tickets[0].createdAt).toLocaleString()),
    ).toBeInTheDocument()

    expect(get).toHaveBeenCalledWith('/api/tickets')
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'false')
    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeInTheDocument()
  })

  it('shows Uncategorized for a ticket without a category', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets } })

    renderWithQuery(<TicketsPage />)

    const row = (await screen.findByRole('cell', { name: tickets[1].subject })).closest('tr')!
    expect(within(row).getByText('Uncategorized')).toBeInTheDocument()
    expect(within(row).getByText('Open')).toBeInTheDocument()
  })

  it('keeps the newest-first order sent by the server', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets } })

    renderWithQuery(<TicketsPage />)
    await screen.findByRole('cell', { name: tickets[0].subject })

    const [, firstRow, secondRow] = screen.getAllByRole('row')
    expect(within(firstRow).getByText(tickets[0].subject)).toBeInTheDocument()
    expect(within(secondRow).getByText(tickets[1].subject)).toBeInTheDocument()
  })

  it('shows an empty message and no table when there are no tickets', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets: [] } })

    renderWithQuery(<TicketsPage />)

    expect(await screen.findByText('No tickets found.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows an error and no table when the request fails', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(new Error('Request failed with status code 500'))

    renderWithQuery(<TicketsPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load tickets')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
