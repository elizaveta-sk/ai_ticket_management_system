import { fireEvent, screen, waitFor } from '@testing-library/react'
import axios from 'axios'
import { Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '../test/render-with-query.tsx'
import TicketDetailPage from './TicketDetailPage.tsx'

const ticket = {
  id: 2,
  subject: 'Refund for my course',
  senderName: 'Grace Student',
  senderEmail: 'grace@example.com',
  status: 'resolved',
  category: 'refund_request',
  createdAt: '2026-03-02T12:00:00.000Z',
  body: 'Hello,\n\nPlease refund my course.',
  assignedTo: null as { id: string; name: string } | null,
}

const agents = [
  { id: 'agent-1', name: 'Ada Agent' },
  { id: 'agent-2', name: 'Bob Agent' },
]

// Answers each API call with its own data. Later tickets answer later requests.
function mockApi(...tickets: object[]) {
  let ticketRequests = 0
  return vi.spyOn(axios, 'get').mockImplementation(async (url) => {
    if (url === '/api/agents') return { data: { agents } }
    const index = Math.min(ticketRequests++, tickets.length - 1)
    return { data: { ticket: tickets[index] } }
  })
}

function renderPage(id = '2') {
  return renderWithQuery(
    <Routes>
      <Route path="/tickets/:id" element={<TicketDetailPage />} />
    </Routes>,
    { route: `/tickets/${id}` },
  )
}

function notFound() {
  return Object.assign(new Error('Request failed with status code 404'), {
    isAxiosError: true,
    response: { status: 404 },
  })
}

describe('TicketDetailPage', () => {
  it('shows a skeleton and the way back while loading', () => {
    vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))

    renderPage()

    expect(screen.getByTestId('ticket-loading')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to tickets' })).toHaveAttribute(
      'href',
      '/tickets',
    )
  })

  it('requests the ticket in the URL and shows its details', async () => {
    const get = mockApi(ticket)

    renderPage()

    expect(await screen.findByRole('heading', { name: ticket.subject })).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/api/tickets/2')
    expect(screen.getByText('Resolved')).toBeInTheDocument()
    expect(screen.getByText('Refund Request')).toBeInTheDocument()
    expect(screen.getByText('Grace Student')).toBeInTheDocument()
    expect(screen.getByText('grace@example.com')).toBeInTheDocument()
    expect(screen.getByText(new Date(ticket.createdAt).toLocaleString())).toBeInTheDocument()
    expect(screen.queryByTestId('ticket-loading')).not.toBeInTheDocument()
  })

  it('keeps the line breaks in the message', async () => {
    mockApi(ticket)

    renderPage()

    const body = await screen.findByText(/Please refund my course/)
    expect(body.textContent).toBe(ticket.body)
    expect(body).toHaveClass('whitespace-pre-wrap')
  })

  it('shows markup in a message as text', async () => {
    const body = '<img src=x onerror=alert(1)> hello'
    mockApi({ ...ticket, body })

    renderPage()

    expect(await screen.findByText(body)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows Uncategorized for a ticket without a category', async () => {
    mockApi({ ...ticket, category: null })

    renderPage()

    expect(await screen.findByText('Uncategorized')).toBeInTheDocument()
  })

  it('says so when the email has no message', async () => {
    mockApi({ ...ticket, body: '' })

    renderPage()

    expect(await screen.findByText('This email has no message.')).toBeInTheDocument()
  })

  it('shows not found, without an error, when the ticket does not exist', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(notFound())

    renderPage('999')

    expect(await screen.findByText('Ticket not found.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to tickets' })).toBeInTheDocument()
  })

  it('encodes an unusual id in the request', async () => {
    const get = vi.spyOn(axios, 'get').mockRejectedValue(notFound())

    renderPage('a%2Fb')

    await screen.findByText('Ticket not found.')
    expect(get).toHaveBeenCalledWith('/api/tickets/a%2Fb')
  })

  it('shows an error when the request fails', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(new Error('Request failed with status code 500'))

    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load ticket')
    expect(screen.queryByText('Ticket not found.')).not.toBeInTheDocument()
  })

  describe('assignee', () => {
    const trigger = () => screen.getByRole('combobox', { name: 'Assigned to' })

    async function openChoices() {
      await waitFor(() => expect(trigger()).toBeEnabled())
      fireEvent.click(trigger())
    }

    async function choose(option: string) {
      await openChoices()
      const item = await screen.findByRole('option', { name: option })
      // Base UI ignores a mouse click on an option unless the press started on it.
      fireEvent.pointerDown(item)
      fireEvent.click(item)
    }

    it('shows Unassigned for a ticket with no assignee', async () => {
      mockApi(ticket)

      renderPage()

      await screen.findByRole('heading', { name: ticket.subject })
      expect(trigger()).toHaveTextContent('Unassigned')
    })

    it('shows the current assignee', async () => {
      mockApi({ ...ticket, assignedTo: agents[1] })

      renderPage()

      await screen.findByRole('heading', { name: ticket.subject })
      expect(trigger()).toHaveTextContent('Bob Agent')
    })

    it('offers Unassigned and every agent', async () => {
      mockApi(ticket)

      renderPage()
      await screen.findByRole('heading', { name: ticket.subject })
      await openChoices()

      const options = await screen.findAllByRole('option')
      expect(options.map((option) => option.textContent)).toEqual([
        'Unassigned',
        'Ada Agent',
        'Bob Agent',
      ])
    })

    it('saves the chosen agent and shows them once saved', async () => {
      mockApi(ticket, { ...ticket, assignedTo: agents[0] })
      const patch = vi.spyOn(axios, 'patch').mockResolvedValue({ data: {} })

      renderPage()
      await screen.findByRole('heading', { name: ticket.subject })
      await choose('Ada Agent')

      await waitFor(() =>
        expect(patch).toHaveBeenCalledWith('/api/tickets/2', { assignedToId: 'agent-1' }),
      )
      await waitFor(() => expect(trigger()).toBeEnabled())
      expect(trigger()).toHaveTextContent('Ada Agent')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('sends null when Unassigned is chosen', async () => {
      mockApi({ ...ticket, assignedTo: agents[0] }, ticket)
      const patch = vi.spyOn(axios, 'patch').mockResolvedValue({ data: {} })

      renderPage()
      await screen.findByRole('heading', { name: ticket.subject })
      await choose('Unassigned')

      await waitFor(() =>
        expect(patch).toHaveBeenCalledWith('/api/tickets/2', { assignedToId: null }),
      )
      await waitFor(() => expect(trigger()).toHaveTextContent('Unassigned'))
    })

    it('shows the choice and blocks changes while it saves', async () => {
      mockApi(ticket)
      vi.spyOn(axios, 'patch').mockReturnValue(new Promise(() => {}))

      renderPage()
      await screen.findByRole('heading', { name: ticket.subject })
      await choose('Ada Agent')

      await waitFor(() => expect(trigger()).toBeDisabled())
      expect(trigger()).toHaveTextContent('Ada Agent')
    })

    it('shows the server error and goes back to the saved assignee when saving fails', async () => {
      mockApi(ticket)
      vi.spyOn(axios, 'patch').mockRejectedValue(
        Object.assign(new Error('Request failed with status code 400'), {
          isAxiosError: true,
          response: { status: 400, data: { error: 'That agent is no longer available' } },
        }),
      )

      renderPage()
      await screen.findByRole('heading', { name: ticket.subject })
      await choose('Ada Agent')

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'That agent is no longer available',
      )
      expect(trigger()).toHaveTextContent('Unassigned')
    })

    it('cannot be changed until the agents have loaded', async () => {
      vi.spyOn(axios, 'get').mockImplementation((url) =>
        url === '/api/agents' ? new Promise(() => {}) : Promise.resolve({ data: { ticket } }),
      )

      renderPage()
      await screen.findByRole('heading', { name: ticket.subject })

      expect(trigger()).toBeDisabled()
    })

    it('keeps an assignee who is no longer in the agent list', async () => {
      const former = { id: 'agent-9', name: 'Former Agent' }
      mockApi({ ...ticket, assignedTo: former })

      renderPage()
      await screen.findByRole('heading', { name: ticket.subject })
      expect(trigger()).toHaveTextContent('Former Agent')
      await openChoices()

      const options = await screen.findAllByRole('option')
      expect(options.map((option) => option.textContent)).toEqual([
        'Unassigned',
        'Ada Agent',
        'Bob Agent',
        'Former Agent',
      ])
    })

    it('reloads the agents when saving fails, so a deleted agent stops being offered', async () => {
      const get = mockApi(ticket)
      vi.spyOn(axios, 'patch').mockRejectedValue(new Error('Request failed'))

      renderPage()
      await screen.findByRole('heading', { name: ticket.subject })
      await choose('Ada Agent')
      await screen.findByRole('alert')

      const agentRequests = get.mock.calls.filter(([url]) => url === '/api/agents')
      expect(agentRequests).toHaveLength(2)
    })

    it('shows a general message when saving fails without a server message', async () => {
      mockApi(ticket)
      vi.spyOn(axios, 'patch').mockRejectedValue(new Error('Network Error'))

      renderPage()
      await screen.findByRole('heading', { name: ticket.subject })
      await choose('Ada Agent')

      expect(await screen.findByRole('alert')).toHaveTextContent('Could not assign ticket')
    })

    it('still shows the assignee when the agents fail to load', async () => {
      vi.spyOn(axios, 'get').mockImplementation(async (url) => {
        if (url === '/api/agents') throw new Error('Request failed with status code 500')
        return { data: { ticket: { ...ticket, assignedTo: agents[1] } } }
      })

      renderPage()

      expect(await screen.findByRole('alert')).toHaveTextContent('Could not load agents')
      expect(trigger()).toHaveTextContent('Bob Agent')
      expect(screen.getByRole('heading', { name: ticket.subject })).toBeInTheDocument()
    })
  })
})
