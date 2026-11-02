import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import axios from 'axios'
import { Route, Routes } from 'react-router'
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
    assignedTo: { id: 'agent-1', name: 'Ada Agent' },
  },
  {
    id: 1,
    subject: 'Cannot access my course',
    senderName: 'Alan Student',
    senderEmail: 'alan@example.com',
    status: 'open',
    category: null,
    createdAt: '2026-03-01T12:00:00.000Z',
    assignedTo: null,
  },
]

// All tickets is the view with every column and filter, newest first.
function renderPage(route = '/tickets?view=all') {
  return renderWithQuery(<TicketsPage />, { route })
}

describe('TicketsPage', () => {
  it('shows the table headers and skeleton rows while loading', () => {
    vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))

    const { container } = renderPage()

    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true')
    for (const name of ['ID', 'Subject', 'Sender', 'Status', 'Category', 'Assignee', 'Created']) {
      expect(screen.getByRole('columnheader', { name })).toBeInTheDocument()
    }
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it('shows the category of a new ticket once classification has set it', async () => {
    const newTicket = { ...tickets[1], createdAt: new Date().toISOString() }
    vi.spyOn(axios, 'get')
      .mockResolvedValueOnce({ data: { tickets: [newTicket], total: 1 } })
      .mockResolvedValue({
        data: { tickets: [{ ...newTicket, category: 'refund_request' }], total: 1 },
      })

    renderPage()

    const row = (await screen.findByRole('cell', { name: newTicket.subject })).closest('tr')!
    expect(within(row).getByText('Uncategorized')).toBeInTheDocument()
    await waitFor(() => expect(within(row).getByText('Refund Request')).toBeInTheDocument(), {
      timeout: 4_000,
    })
    expect(within(row).queryByText('Uncategorized')).not.toBeInTheDocument()
  })

  it('does not keep requesting tickets for an old ticket with no category', async () => {
    const get = vi.spyOn(axios, 'get').mockResolvedValue({
      data: { tickets: [tickets[1]], total: 1 },
    })

    renderPage()

    await screen.findByRole('cell', { name: tickets[1].subject })
    await new Promise((resolve) => setTimeout(resolve, 2_500))
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('requests /api/tickets and shows a row for each ticket with readable labels', async () => {
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets, total: tickets.length } })

    const { container } = renderPage()

    const row = (await screen.findByRole('cell', { name: tickets[0].subject })).closest('tr')!
    expect(within(row).getByText('Grace Student')).toBeInTheDocument()
    expect(within(row).getByText('grace@example.com')).toBeInTheDocument()
    expect(within(row).getByText('Resolved')).toBeInTheDocument()
    expect(within(row).getByText('Refund Request')).toBeInTheDocument()
    expect(within(row).getByText('Ada Agent')).toBeInTheDocument()
    expect(within(row).getByTitle(new Date(tickets[0].createdAt).toLocaleString())).toBeInTheDocument()

    expect(get).toHaveBeenCalledWith('/api/tickets', {
      params: { sortBy: 'createdAt', sortOrder: 'desc', page: 1, pageSize: 20 },
    })
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'false')
    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeInTheDocument()
  })

  it('links each subject to the ticket details', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets, total: tickets.length } })

    renderPage()

    expect(await screen.findByRole('link', { name: tickets[0].subject })).toHaveAttribute(
      'href',
      '/tickets/2?view=all',
    )
    expect(screen.getByRole('link', { name: tickets[1].subject })).toHaveAttribute(
      'href',
      '/tickets/1?view=all',
    )
  })

  it('shows Uncategorized for a ticket without a category', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets, total: tickets.length } })

    renderPage()

    const row = (await screen.findByRole('cell', { name: tickets[1].subject })).closest('tr')!
    expect(within(row).getByText('Uncategorized')).toBeInTheDocument()
    expect(within(row).getByText('Open')).toBeInTheDocument()
  })

  it('keeps the newest-first order sent by the server', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets, total: tickets.length } })

    renderPage()
    await screen.findByRole('cell', { name: tickets[0].subject })

    const [, firstRow, secondRow] = screen.getAllByRole('row')
    expect(within(firstRow).getByText(tickets[0].subject)).toBeInTheDocument()
    expect(within(secondRow).getByText(tickets[1].subject)).toBeInTheDocument()
  })

  it('marks Created as the sorted column to begin with', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets, total: tickets.length } })

    renderPage()
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
      .mockResolvedValueOnce({ data: { tickets, total: tickets.length } })
      .mockResolvedValueOnce({ data: { tickets: [tickets[1], tickets[0]], total: 2 } })

    renderPage()
    await screen.findByRole('cell', { name: tickets[0].subject })

    fireEvent.click(screen.getByRole('button', { name: 'Subject' }))

    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/api/tickets', {
        params: { sortBy: 'subject', sortOrder: 'asc', page: 1, pageSize: 20 },
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
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets, total: tickets.length } })

    renderPage()
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
      expect(get).toHaveBeenCalledWith('/api/tickets', { params: { sortBy, sortOrder, page: 1, pageSize: 20 } })
    }
  })

  it('sorts Created newest first when returning to it from another column', async () => {
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets, total: tickets.length } })

    renderPage()
    await screen.findByRole('cell', { name: tickets[0].subject })

    fireEvent.click(screen.getByRole('button', { name: 'Created' }))
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/api/tickets', {
        params: { sortBy: 'createdAt', sortOrder: 'asc', page: 1, pageSize: 20 },
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
      .mockResolvedValueOnce({ data: { tickets, total: tickets.length } })
      .mockReturnValueOnce(new Promise(() => {}))

    const { container } = renderPage()
    await screen.findByRole('cell', { name: tickets[0].subject })

    fireEvent.click(screen.getByRole('button', { name: 'Subject' }))

    await waitFor(() => expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true'))
    expect(screen.getByRole('cell', { name: tickets[0].subject })).toBeInTheDocument()
    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeInTheDocument()
  })

  it('sorts by one column only, even with shift held', async () => {
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets, total: tickets.length } })

    renderPage()
    await screen.findByRole('cell', { name: tickets[0].subject })

    fireEvent.click(screen.getByRole('button', { name: 'Subject' }), { shiftKey: true })

    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/api/tickets', {
        params: { sortBy: 'subject', sortOrder: 'asc', page: 1, pageSize: 20 },
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
      const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets, total: tickets.length } })

      renderPage()
      await screen.findByRole('cell', { name: tickets[0].subject })

      expect(screen.getByRole('combobox', { name: 'Filter by status' })).toHaveTextContent(
        'All Statuses',
      )
      expect(screen.getByRole('combobox', { name: 'Filter by category' })).toHaveTextContent(
        'All Categories',
      )
      expect(get.mock.calls[0][1]?.params).toEqual({ sortBy: 'createdAt', sortOrder: 'desc', page: 1, pageSize: 20 })
    })

    it('asks the server for the chosen status and shows the rows it returns', async () => {
      const get = vi
        .spyOn(axios, 'get')
        .mockResolvedValueOnce({ data: { tickets, total: tickets.length } })
        .mockResolvedValueOnce({ data: { tickets: [tickets[0]], total: 1 } })

      renderPage()
      await screen.findByRole('cell', { name: tickets[1].subject })

      await choose('Filter by status', 'Resolved')

      await waitFor(() =>
        expect(screen.queryByRole('cell', { name: tickets[1].subject })).not.toBeInTheDocument(),
      )
      expect(screen.getByRole('cell', { name: tickets[0].subject })).toBeInTheDocument()
      expect(get.mock.lastCall?.[1]?.params).toMatchObject({ status: 'resolved' })
    })

    it('offers the three categories and Uncategorized', async () => {
      vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets: [], total: 0 } })

      renderPage()
      await screen.findByText('No tickets found.')

      fireEvent.click(screen.getByRole('combobox', { name: 'Filter by category' }))

      const options = await screen.findAllByRole('option')
      expect(options.map((option) => option.textContent)).toEqual([
        'All Categories',
        'General Question',
        'Technical Question',
        'Refund Request',
        'Uncategorized',
      ])
    })

    it('sends a search to the server once typing pauses, not on every keystroke', async () => {
      const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets, total: tickets.length } })

      renderPage()
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
        page: 1,
        pageSize: 20,
        search: 'refund',
      })
    })

    it('sends no new request for a search of only spaces', async () => {
      const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets, total: tickets.length } })

      renderPage()
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
        .mockResolvedValueOnce({ data: { tickets, total: tickets.length } })
        .mockResolvedValueOnce({ data: { tickets: [], total: 0 } })

      renderPage()
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
      const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets, total: tickets.length } })

      renderPage()
      await screen.findByRole('cell', { name: tickets[0].subject })

      await choose('Filter by category', option)

      await waitFor(() => expect(get.mock.lastCall?.[1]?.params).toMatchObject({ category }))
    })

    it('combines filters with each other and with the sort', async () => {
      const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets, total: tickets.length } })

      renderPage()
      await screen.findByRole('cell', { name: tickets[0].subject })

      fireEvent.click(screen.getByRole('button', { name: 'Subject' }))
      await choose('Filter by status', 'Open')
      await choose('Filter by category', 'General Question')

      await waitFor(() =>
        expect(get.mock.lastCall?.[1]?.params).toEqual({
          sortBy: 'subject',
          sortOrder: 'asc',
          page: 1,
          pageSize: 20,
          status: 'open',
          category: 'general_question',
        }),
      )
    })

    it('stops sending a filter once All is chosen again', async () => {
      const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets, total: tickets.length } })

      renderPage()
      await screen.findByRole('cell', { name: tickets[0].subject })

      await choose('Filter by status', 'Closed')
      await waitFor(() => expect(get.mock.lastCall?.[1]?.params).toMatchObject({ status: 'closed' }))
      get.mockClear()
      await choose('Filter by status', 'All Statuses')

      // Going back to a filter set that was already loaded may be served from the
      // cache, so this checks the request only if one was made.
      for (const [, config] of get.mock.calls) {
        expect(config?.params).toEqual({ sortBy: 'createdAt', sortOrder: 'desc', page: 1, pageSize: 20 })
      }
      expect(screen.getByRole('cell', { name: tickets[0].subject })).toBeInTheDocument()
    })

    it('keeps the filters on screen when nothing matches, so they can be changed', async () => {
      vi.spyOn(axios, 'get')
        .mockResolvedValueOnce({ data: { tickets, total: tickets.length } })
        .mockResolvedValueOnce({ data: { tickets: [], total: 0 } })
        .mockResolvedValueOnce({ data: { tickets, total: tickets.length } })

      renderPage()
      await screen.findByRole('cell', { name: tickets[0].subject })

      await choose('Filter by status', 'Closed')

      expect(await screen.findByText('No tickets found.')).toBeInTheDocument()
      expect(screen.queryByRole('table')).not.toBeInTheDocument()

      await choose('Filter by status', 'Open')

      expect(await screen.findByRole('cell', { name: tickets[0].subject })).toBeInTheDocument()
    })

    it('keeps the filters on screen when a request fails, so another can be tried', async () => {
      vi.spyOn(axios, 'get')
        .mockResolvedValueOnce({ data: { tickets, total: tickets.length } })
        .mockRejectedValueOnce(new Error('Request failed with status code 500'))
        .mockResolvedValueOnce({ data: { tickets, total: tickets.length } })

      renderPage()
      await screen.findByRole('cell', { name: tickets[0].subject })

      await choose('Filter by status', 'Closed')

      expect(await screen.findByRole('alert')).toHaveTextContent('Could not load tickets')

      await choose('Filter by status', 'Open')

      expect(await screen.findByRole('cell', { name: tickets[0].subject })).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('pagination', () => {
    const onePage = (total: number) => ({ data: { tickets, total } })

    it('requests the first page and shows the total and page count', async () => {
      const get = vi.spyOn(axios, 'get').mockResolvedValue(onePage(45))

      renderPage()

      expect(await screen.findByText('45 tickets')).toBeInTheDocument()
      expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
      expect(get.mock.lastCall?.[1]?.params).toMatchObject({ page: 1, pageSize: 20 })
    })

    it('shows no page controls while loading', () => {
      vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))

      renderPage()

      expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    })

    it('disables both buttons when everything fits on one page', async () => {
      vi.spyOn(axios, 'get').mockResolvedValue(onePage(1))

      renderPage()

      expect(await screen.findByText('1 ticket')).toBeInTheDocument()
      expect(screen.getByText('Page 1 of 1')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    })

    it('moves between pages and disables the buttons at each end', async () => {
      const get = vi.spyOn(axios, 'get').mockResolvedValue(onePage(25))

      renderPage()
      await screen.findByText('Page 1 of 2')
      expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

      fireEvent.click(screen.getByRole('button', { name: 'Next' }))

      expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument()
      await waitFor(() => expect(get.mock.lastCall?.[1]?.params).toMatchObject({ page: 2 }))
      await waitFor(() => expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'false'))
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

      fireEvent.click(screen.getByRole('button', { name: 'Previous' }))

      expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument()
    })

    it('keeps the current rows on screen while the next page loads', async () => {
      vi.spyOn(axios, 'get')
        .mockResolvedValueOnce(onePage(25))
        .mockReturnValueOnce(new Promise(() => {}))

      renderPage()
      await screen.findByText('Page 1 of 2')

      fireEvent.click(screen.getByRole('button', { name: 'Next' }))

      await waitFor(() => expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true'))
      expect(screen.getByRole('cell', { name: tickets[0].subject })).toBeInTheDocument()
    })

    async function goToPageTwo() {
      const get = vi.spyOn(axios, 'get').mockResolvedValue(onePage(25))
      renderPage()
      await screen.findByText('Page 1 of 2')
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      await screen.findByText('Page 2 of 2')
      await waitFor(() => expect(get.mock.lastCall?.[1]?.params).toMatchObject({ page: 2 }))
      return get
    }

    it('returns to the first page when the sort changes', async () => {
      const get = await goToPageTwo()

      fireEvent.click(screen.getByRole('button', { name: 'Subject' }))

      await waitFor(() =>
        expect(get.mock.lastCall?.[1]?.params).toMatchObject({ sortBy: 'subject', page: 1 }),
      )
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    })

    it('returns to the first page when a filter changes', async () => {
      const get = await goToPageTwo()

      fireEvent.click(screen.getByRole('combobox', { name: 'Filter by status' }))
      const option = await screen.findByRole('option', { name: 'Closed' })
      fireEvent.pointerDown(option)
      fireEvent.click(option)

      await waitFor(() =>
        expect(get.mock.lastCall?.[1]?.params).toMatchObject({ status: 'closed', page: 1 }),
      )
    })

    it('returns to the first page in a single request when a search is entered', async () => {
      const get = await goToPageTwo()
      get.mockClear()

      fireEvent.change(screen.getByRole('searchbox', { name: 'Search tickets' }), {
        target: { value: 'refund' },
      })

      await waitFor(() => expect(get).toHaveBeenCalled())
      expect(get).toHaveBeenCalledTimes(1)
      expect(get.mock.lastCall?.[1]?.params).toMatchObject({ search: 'refund', page: 1 })
    })

    it('moves to the last page when the current page no longer exists', async () => {
      const get = vi
        .spyOn(axios, 'get')
        .mockResolvedValueOnce(onePage(25))
        .mockResolvedValueOnce({ data: { tickets: [], total: 20 } })
        .mockResolvedValue(onePage(20))

      renderPage()
      await screen.findByText('Page 1 of 2')

      // The first page was refetched with a smaller total before Next took effect.
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))

      expect(await screen.findByText('Page 1 of 1')).toBeInTheDocument()
      expect(get.mock.lastCall?.[1]?.params).toMatchObject({ page: 1 })
      expect(screen.queryByText('No tickets found.')).not.toBeInTheDocument()
      expect(screen.getByRole('cell', { name: tickets[0].subject })).toBeInTheDocument()
    })
  })

  it('shows an empty message and no table when there are no tickets', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets: [], total: 0 } })

    renderPage()

    expect(await screen.findByText('No tickets found.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows an error and no table when the request fails', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(new Error('Request failed with status code 500'))

    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load tickets')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
  describe('views', () => {
    const ticketsApi = () =>
      vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets, total: tickets.length } })

    it('opens Need attention by default, longest waiting first', async () => {
      const get = ticketsApi()

      renderPage('/tickets')

      expect(screen.getByRole('heading', { name: 'Need attention' })).toBeInTheDocument()
      await screen.findByRole('cell', { name: tickets[0].subject })
      expect(get.mock.lastCall?.[1]?.params).toMatchObject({
        view: 'attention',
        sortBy: 'createdAt',
        sortOrder: 'asc',
      })
    })

    it('treats an unknown view in the URL as the default', () => {
      vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))

      renderPage('/tickets?view=nope')

      expect(screen.getByRole('heading', { name: 'Need attention' })).toBeInTheDocument()
    })

    it('shows finished work newest first', async () => {
      const get = ticketsApi()

      renderPage('/tickets?view=closed')

      await screen.findByRole('cell', { name: tickets[0].subject })
      expect(get.mock.lastCall?.[1]?.params).toMatchObject({ view: 'closed', sortOrder: 'desc' })
    })

    it('shows status only in All tickets, where it varies', () => {
      vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))

      renderPage('/tickets')

      expect(screen.queryByRole('columnheader', { name: 'Status' })).not.toBeInTheDocument()
      expect(screen.queryByRole('combobox', { name: 'Filter by status' })).not.toBeInTheDocument()
    })

    it('offers only the filters that can narrow the view', () => {
      vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))

      const { unmount } = renderPage('/tickets?view=refunds')
      expect(screen.queryByRole('combobox', { name: 'Filter by category' })).not.toBeInTheDocument()
      unmount()

      renderPage('/tickets?view=attention')
      expect(screen.queryByRole('combobox', { name: 'Filter by assignee' })).not.toBeInTheDocument()
    })

    it('does not offer Refund Request as a category in Need attention', async () => {
      vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))

      renderPage('/tickets')

      fireEvent.click(screen.getByRole('combobox', { name: 'Filter by category' }))
      await screen.findByRole('option', { name: 'General Question' })
      expect(screen.queryByRole('option', { name: 'Refund Request' })).not.toBeInTheDocument()
    })

    it('filters by assignee, loading the agents only when asked', async () => {
      const get = vi.spyOn(axios, 'get').mockImplementation(async (url) =>
        url === '/api/agents'
          ? { data: { agents: [{ id: 'agent-1', name: 'Ada Agent' }] } }
          : { data: { tickets, total: tickets.length } },
      )

      renderPage()
      await screen.findByRole('cell', { name: tickets[0].subject })
      expect(get).not.toHaveBeenCalledWith('/api/agents')

      fireEvent.click(screen.getByRole('combobox', { name: 'Filter by assignee' }))
      const option = await screen.findByRole('option', { name: 'Ada Agent' })
      fireEvent.pointerDown(option)
      fireEvent.click(option)

      await waitFor(() =>
        expect(get.mock.lastCall?.[1]?.params).toMatchObject({ assignedToId: 'agent-1' }),
      )
    })

    it('marks an old open ticket but not an old finished one', async () => {
      ticketsApi()

      renderPage()

      const open = (await screen.findByRole('cell', { name: tickets[1].subject })).closest('tr')!
      const resolved = screen.getByRole('cell', { name: tickets[0].subject }).closest('tr')!
      expect(within(open).getByRole('time')).toHaveClass('text-destructive')
      expect(within(resolved).getByRole('time')).not.toHaveClass('text-destructive')
    })
  })

  describe('with a ticket open', () => {
    function renderWithPanel(route = '/tickets/2?view=closed') {
      return renderWithQuery(
        <Routes>
          <Route path="/tickets" element={<TicketsPage />}>
            <Route path=":id" element={<p>Panel for this ticket</p>} />
          </Route>
        </Routes>,
        { route },
      )
    }

    it('shows the panel beside the list and marks the row', async () => {
      vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets, total: tickets.length } })

      renderWithPanel()

      expect(screen.getByText('Panel for this ticket')).toBeInTheDocument()
      const row = (await screen.findByRole('cell', { name: tickets[0].subject })).closest('tr')!
      expect(row).toHaveAttribute('aria-current', 'true')
      expect(screen.getByRole('cell', { name: tickets[1].subject }).closest('tr')).not.toHaveAttribute(
        'aria-current',
      )
    })

    it('drops the columns that do not fit beside the panel', async () => {
      vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets, total: tickets.length } })

      renderWithPanel()

      await screen.findByRole('cell', { name: tickets[0].subject })
      for (const name of ['Subject', 'Sender', 'Assignee', 'Created']) {
        expect(screen.getByRole('columnheader', { name })).toBeInTheDocument()
      }
      expect(screen.queryByRole('columnheader', { name: 'ID' })).not.toBeInTheDocument()
      expect(screen.queryByRole('columnheader', { name: 'Category' })).not.toBeInTheDocument()
    })

    it('opens a ticket from anywhere on its row, staying in the view', async () => {
      vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets, total: tickets.length } })

      renderWithPanel('/tickets?view=closed')
      expect(screen.queryByText('Panel for this ticket')).not.toBeInTheDocument()

      const row = (await screen.findByRole('cell', { name: tickets[0].subject })).closest('tr')!
      fireEvent.click(within(row).getByText('Grace Student'))

      expect(await screen.findByText('Panel for this ticket')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Closed' })).toBeInTheDocument()
    })
  })
})
