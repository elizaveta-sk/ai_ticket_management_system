import { fireEvent, screen, waitFor, within } from '@testing-library/react'
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

    expect(get).toHaveBeenCalledWith('/api/tickets', {
      params: { sortBy: 'createdAt', sortOrder: 'desc' },
    })
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

  it('marks Created as the sorted column to begin with', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets } })

    renderWithQuery(<TicketsPage />)
    await screen.findByRole('cell', { name: tickets[0].subject })

    expect(screen.getByRole('columnheader', { name: 'Created' })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    expect(screen.getByRole('columnheader', { name: 'Subject' })).toHaveAttribute(
      'aria-sort',
      'none',
    )
  })

  it('asks the server to sort when a header is clicked, and shows the order it returns', async () => {
    const get = vi
      .spyOn(axios, 'get')
      .mockResolvedValueOnce({ data: { tickets } })
      .mockResolvedValueOnce({ data: { tickets: [tickets[1], tickets[0]] } })

    renderWithQuery(<TicketsPage />)
    await screen.findByRole('cell', { name: tickets[0].subject })

    fireEvent.click(screen.getByRole('button', { name: 'Subject' }))

    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/api/tickets', {
        params: { sortBy: 'subject', sortOrder: 'asc' },
      }),
    )
    await waitFor(() => {
      const [, firstRow] = screen.getAllByRole('row')
      expect(within(firstRow).getByText(tickets[1].subject)).toBeInTheDocument()
    })
    expect(screen.getByRole('columnheader', { name: 'Subject' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    expect(screen.getByRole('columnheader', { name: 'Created' })).toHaveAttribute(
      'aria-sort',
      'none',
    )
  })

  it.each([
    ['Subject', 'subject'],
    ['Sender', 'senderName'],
    ['Status', 'status'],
    ['Category', 'category'],
  ])('sorts %s ascending, then descending, then ascending again', async (name, sortBy) => {
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets } })

    renderWithQuery(<TicketsPage />)
    await screen.findByRole('cell', { name: tickets[0].subject })

    for (const sortOrder of ['asc', 'desc', 'asc']) {
      fireEvent.click(screen.getByRole('button', { name }))
      await waitFor(() =>
        expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'false'),
      )
      expect(screen.getByRole('columnheader', { name })).toHaveAttribute(
        'aria-sort',
        sortOrder === 'asc' ? 'ascending' : 'descending',
      )
      expect(get).toHaveBeenCalledWith('/api/tickets', { params: { sortBy, sortOrder } })
    }
  })

  it('sorts Created newest first when returning to it from another column', async () => {
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets } })

    renderWithQuery(<TicketsPage />)
    await screen.findByRole('cell', { name: tickets[0].subject })

    fireEvent.click(screen.getByRole('button', { name: 'Created' }))
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/api/tickets', {
        params: { sortBy: 'createdAt', sortOrder: 'asc' },
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Status' }))
    fireEvent.click(screen.getByRole('button', { name: 'Created' }))

    expect(screen.getByRole('columnheader', { name: 'Created' })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
  })

  it('keeps the current rows on screen, marked busy, while a new sort loads', async () => {
    vi.spyOn(axios, 'get')
      .mockResolvedValueOnce({ data: { tickets } })
      .mockReturnValueOnce(new Promise(() => {}))

    const { container } = renderWithQuery(<TicketsPage />)
    await screen.findByRole('cell', { name: tickets[0].subject })

    fireEvent.click(screen.getByRole('button', { name: 'Subject' }))

    await waitFor(() => expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true'))
    expect(screen.getByRole('cell', { name: tickets[0].subject })).toBeInTheDocument()
    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeInTheDocument()
  })

  it('sorts by one column only, even with shift held', async () => {
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets } })

    renderWithQuery(<TicketsPage />)
    await screen.findByRole('cell', { name: tickets[0].subject })

    fireEvent.click(screen.getByRole('button', { name: 'Subject' }), { shiftKey: true })

    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/api/tickets', {
        params: { sortBy: 'subject', sortOrder: 'asc' },
      }),
    )
    expect(screen.getByRole('columnheader', { name: 'Created' })).toHaveAttribute(
      'aria-sort',
      'none',
    )
  })

  describe('filters', () => {
    async function choose(filter: string, option: string) {
      fireEvent.click(screen.getByRole('combobox', { name: filter }))
      const item = await screen.findByRole('option', { name: option })
      // Base UI ignores a mouse click on an option unless the press started on it.
      fireEvent.pointerDown(item)
      fireEvent.click(item)
      await waitFor(() =>
        expect(screen.queryByRole('option', { name: option })).not.toBeInTheDocument(),
      )
      expect(screen.getByRole('combobox', { name: filter })).toHaveTextContent(option)
    }

    it('starts with every ticket and sends no filters', async () => {
      const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets } })

      renderWithQuery(<TicketsPage />)
      await screen.findByRole('cell', { name: tickets[0].subject })

      expect(screen.getByRole('combobox', { name: 'Filter by status' })).toHaveTextContent(
        'All statuses',
      )
      expect(screen.getByRole('combobox', { name: 'Filter by category' })).toHaveTextContent(
        'All categories',
      )
      expect(get.mock.calls[0][1]?.params).toEqual({ sortBy: 'createdAt', sortOrder: 'desc' })
    })

    it('asks the server for the chosen status and shows the rows it returns', async () => {
      const get = vi
        .spyOn(axios, 'get')
        .mockResolvedValueOnce({ data: { tickets } })
        .mockResolvedValueOnce({ data: { tickets: [tickets[0]] } })

      renderWithQuery(<TicketsPage />)
      await screen.findByRole('cell', { name: tickets[1].subject })

      await choose('Filter by status', 'Resolved')

      await waitFor(() =>
        expect(screen.queryByRole('cell', { name: tickets[1].subject })).not.toBeInTheDocument(),
      )
      expect(screen.getByRole('cell', { name: tickets[0].subject })).toBeInTheDocument()
      expect(get.mock.lastCall?.[1]?.params).toMatchObject({ status: 'resolved' })
    })

    it('offers the three categories and Uncategorized', async () => {
      vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets: [] } })

      renderWithQuery(<TicketsPage />)
      await screen.findByText('No tickets found.')

      fireEvent.click(screen.getByRole('combobox', { name: 'Filter by category' }))

      const options = await screen.findAllByRole('option')
      expect(options.map((option) => option.textContent)).toEqual([
        'All categories',
        'General Question',
        'Technical Question',
        'Refund Request',
        'Uncategorized',
      ])
    })

    it('sends a search to the server once typing pauses, not on every keystroke', async () => {
      const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets } })

      renderWithQuery(<TicketsPage />)
      await screen.findByRole('cell', { name: tickets[0].subject })
      get.mockClear()

      const input = screen.getByRole('searchbox', { name: 'Search tickets' })
      fireEvent.change(input, { target: { value: 're' } })
      fireEvent.change(input, { target: { value: 'ref' } })
      fireEvent.change(input, { target: { value: '  refund ' } })

      expect(get).not.toHaveBeenCalled()
      await waitFor(() => expect(get).toHaveBeenCalled())
      expect(get).toHaveBeenCalledTimes(1)
      expect(get.mock.lastCall?.[1]?.params).toEqual({
        sortBy: 'createdAt',
        sortOrder: 'desc',
        search: 'refund',
      })
    })

    it('sends no new request for a search of only spaces', async () => {
      const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets } })

      renderWithQuery(<TicketsPage />)
      await screen.findByRole('cell', { name: tickets[0].subject })
      get.mockClear()

      fireEvent.change(screen.getByRole('searchbox', { name: 'Search tickets' }), {
        target: { value: '   ' },
      })
      await new Promise((resolve) => setTimeout(resolve, 400))

      expect(get).not.toHaveBeenCalled()
    })

    it('keeps the search box and its text when nothing matches', async () => {
      vi.spyOn(axios, 'get')
        .mockResolvedValueOnce({ data: { tickets } })
        .mockResolvedValueOnce({ data: { tickets: [] } })

      renderWithQuery(<TicketsPage />)
      await screen.findByRole('cell', { name: tickets[0].subject })

      const input = screen.getByRole('searchbox', { name: 'Search tickets' })
      fireEvent.change(input, { target: { value: 'nothing like this' } })

      expect(await screen.findByText('No tickets found.')).toBeInTheDocument()
      expect(screen.getByRole('searchbox', { name: 'Search tickets' })).toBe(input)
      expect(input).toHaveValue('nothing like this')
    })

    it.each([
      ['General Question', 'general_question'],
      ['Technical Question', 'technical_question'],
      ['Refund Request', 'refund_request'],
      ['Uncategorized', 'uncategorized'],
    ])('asks the server for the %s category', async (option, category) => {
      const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets } })

      renderWithQuery(<TicketsPage />)
      await screen.findByRole('cell', { name: tickets[0].subject })

      await choose('Filter by category', option)

      await waitFor(() => expect(get.mock.lastCall?.[1]?.params).toMatchObject({ category }))
    })

    it('combines filters with each other and with the sort', async () => {
      const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets } })

      renderWithQuery(<TicketsPage />)
      await screen.findByRole('cell', { name: tickets[0].subject })

      fireEvent.click(screen.getByRole('button', { name: 'Subject' }))
      await choose('Filter by status', 'Open')
      await choose('Filter by category', 'General Question')

      await waitFor(() =>
        expect(get.mock.lastCall?.[1]?.params).toEqual({
          sortBy: 'subject',
          sortOrder: 'asc',
          status: 'open',
          category: 'general_question',
        }),
      )
    })

    it('stops sending a filter once All is chosen again', async () => {
      const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets } })

      renderWithQuery(<TicketsPage />)
      await screen.findByRole('cell', { name: tickets[0].subject })

      await choose('Filter by status', 'Closed')
      await waitFor(() => expect(get.mock.lastCall?.[1]?.params).toMatchObject({ status: 'closed' }))
      get.mockClear()
      await choose('Filter by status', 'All statuses')

      // Going back to a filter set that was already loaded may be served from the
      // cache, so this checks the request only if one was made.
      for (const [, config] of get.mock.calls) {
        expect(config?.params).toEqual({ sortBy: 'createdAt', sortOrder: 'desc' })
      }
      expect(screen.getByRole('cell', { name: tickets[0].subject })).toBeInTheDocument()
    })

    it('keeps the filters on screen when nothing matches, so they can be changed', async () => {
      vi.spyOn(axios, 'get')
        .mockResolvedValueOnce({ data: { tickets } })
        .mockResolvedValueOnce({ data: { tickets: [] } })
        .mockResolvedValueOnce({ data: { tickets } })

      renderWithQuery(<TicketsPage />)
      await screen.findByRole('cell', { name: tickets[0].subject })

      await choose('Filter by status', 'Closed')

      expect(await screen.findByText('No tickets found.')).toBeInTheDocument()
      expect(screen.queryByRole('table')).not.toBeInTheDocument()

      await choose('Filter by status', 'Open')

      expect(await screen.findByRole('cell', { name: tickets[0].subject })).toBeInTheDocument()
    })

    it('keeps the filters on screen when a request fails, so another can be tried', async () => {
      vi.spyOn(axios, 'get')
        .mockResolvedValueOnce({ data: { tickets } })
        .mockRejectedValueOnce(new Error('Request failed with status code 500'))
        .mockResolvedValueOnce({ data: { tickets } })

      renderWithQuery(<TicketsPage />)
      await screen.findByRole('cell', { name: tickets[0].subject })

      await choose('Filter by status', 'Closed')

      expect(await screen.findByRole('alert')).toHaveTextContent('Could not load tickets')

      await choose('Filter by status', 'Open')

      expect(await screen.findByRole('cell', { name: tickets[0].subject })).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
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
