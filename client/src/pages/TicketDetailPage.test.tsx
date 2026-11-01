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
  replies: [] as object[],
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

function expectNoTicketActions() {
  expect(screen.queryByRole('region', { name: 'Replies' })).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: 'Your reply' })).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
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

  it('shows the category of a new ticket once classification has set it', async () => {
    const createdAt = new Date().toISOString()
    mockApi(
      { ...ticket, createdAt, category: null },
      { ...ticket, createdAt, category: 'refund_request' },
    )

    renderPage()

    const category = await screen.findByRole('combobox', { name: 'Category' })
    expect(category).toHaveTextContent('Uncategorized')
    await waitFor(() => expect(category).toHaveTextContent('Refund Request'), { timeout: 4_000 })
  })

  it('requests the ticket in the URL and shows its details', async () => {
    const get = mockApi(ticket)

    renderPage()

    expect(await screen.findByRole('heading', { name: ticket.subject })).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/api/tickets/2')
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Resolved')
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('Refund Request')
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

  it('removes markup from everything the sender wrote', async () => {
    const markup = '<img src=x onerror=alert(1)>'
    mockApi({
      ...ticket,
      subject: `${markup}Refund`,
      senderName: `${markup}Grace`,
      body: `${markup}Please help`,
      replies: [
        {
          id: 1,
          body: `${markup}Thank you`,
          senderType: 'customer',
          createdAt: '2026-03-03T10:00:00.000Z',
          author: null,
        },
      ],
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Refund' })).toBeInTheDocument()
    expect(screen.getByText('Please help')).toBeInTheDocument()
    expect(screen.getByText('Thank you')).toBeInTheDocument()
    expect(screen.getAllByText('Grace')).toHaveLength(2)
    expect(screen.queryByText(/onerror/)).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('says the email has no message when only markup was sent', async () => {
    mockApi({ ...ticket, body: '<script>alert(1)</script>' })

    renderPage()

    expect(await screen.findByText('This email has no message.')).toBeInTheDocument()
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

  it('offers no replies or controls while loading', () => {
    vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))

    renderPage()

    expectNoTicketActions()
  })

  it('offers no replies or controls when the ticket does not exist', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(notFound())

    renderPage('999')

    await screen.findByText('Ticket not found.')
    expectNoTicketActions()
  })

  it('offers no replies or controls when the request fails', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(new Error('Request failed with status code 500'))

    renderPage()

    await screen.findByRole('alert')
    expectNoTicketActions()
  })

  // How the thread itself looks and behaves is covered in TicketReplies.test.tsx.
  describe('replies', () => {
    const reply = {
      id: 1,
      body: 'Your refund is on its way.',
      senderType: 'agent',
      createdAt: '2026-03-03T09:00:00.000Z',
      author: { name: 'Ada Agent' },
    }
    const replyBox = () => screen.getByRole('textbox', { name: 'Your reply' })

    async function sendReply(text: string) {
      await screen.findByRole('heading', { name: ticket.subject })
      fireEvent.change(replyBox(), { target: { value: text } })
      fireEvent.click(screen.getByRole('button', { name: 'Send reply' }))
    }

    it('shows the ticket replies below the message', async () => {
      mockApi({ ...ticket, replies: [reply] })

      renderPage()

      const message = await screen.findByText(/Please refund my course/)
      const replyText = screen.getByText(reply.body)
      expect(
        message.compareDocumentPosition(replyText) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    })

    it('shows a customer reply under the name of the ticket sender', async () => {
      const customerReply = { ...reply, senderType: 'customer', author: null }
      mockApi({ ...ticket, replies: [customerReply] })

      renderPage()

      expect(await screen.findByRole('listitem')).toHaveTextContent('Grace Student')
    })

    it('shows a new reply once sent, by loading the ticket again', async () => {
      const get = mockApi(ticket, { ...ticket, replies: [reply] })
      const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: {} })

      renderPage()
      await sendReply(reply.body)

      expect(await screen.findByText(reply.body)).toBeInTheDocument()
      expect(post).toHaveBeenCalledWith('/api/tickets/2/replies', { body: reply.body })
      expect(get.mock.calls.filter(([url]) => url === '/api/tickets/2')).toHaveLength(2)
      await waitFor(() => expect(replyBox()).toHaveValue(''))
      expect(screen.queryByText('No replies yet.')).not.toBeInTheDocument()
    })

    it('keeps the reply in the box until the refreshed thread arrives', async () => {
      let ticketRequests = 0
      vi.spyOn(axios, 'get').mockImplementation((url) => {
        if (url === '/api/agents') return Promise.resolve({ data: { agents } })
        ticketRequests += 1
        return ticketRequests === 1 ? Promise.resolve({ data: { ticket } }) : new Promise(() => {})
      })
      vi.spyOn(axios, 'post').mockResolvedValue({ data: {} })

      renderPage()
      await sendReply('Hello')

      await waitFor(() => expect(ticketRequests).toBe(2))
      expect(replyBox()).toHaveValue('Hello')
      expect(screen.getByRole('button', { name: 'Sending...' })).toBeDisabled()
    })

    it('keeps the ticket on screen and shows an error if the refresh fails', async () => {
      let ticketRequests = 0
      vi.spyOn(axios, 'get').mockImplementation(async (url) => {
        if (url === '/api/agents') return { data: { agents } }
        ticketRequests += 1
        if (ticketRequests > 1) throw new Error('Request failed with status code 500')
        return { data: { ticket } }
      })
      vi.spyOn(axios, 'post').mockResolvedValue({ data: {} })

      renderPage()
      await sendReply('Hello')

      expect(await screen.findByRole('alert')).toHaveTextContent('Could not load ticket')
      expect(screen.getByRole('heading', { name: ticket.subject })).toBeInTheDocument()
    })

    it('keeps an unsent draft when the ticket is updated from the controls', async () => {
      const get = mockApi(ticket, { ...ticket, status: 'closed' })
      vi.spyOn(axios, 'patch').mockResolvedValue({ data: {} })

      renderPage()
      await screen.findByRole('heading', { name: ticket.subject })
      fireEvent.change(replyBox(), { target: { value: 'Still writing' } })
      const status = screen.getByRole('combobox', { name: 'Status' })
      fireEvent.click(status)
      const closed = await screen.findByRole('option', { name: 'Closed' })
      // Base UI ignores a mouse click on an option unless the press started on it.
      fireEvent.pointerDown(closed)
      fireEvent.click(closed)

      // The control shows the choice while saving, so wait for the reloaded ticket instead.
      await waitFor(() =>
        expect(get.mock.calls.filter(([url]) => url === '/api/tickets/2')).toHaveLength(2),
      )
      await waitFor(() => expect(screen.getByRole('combobox', { name: 'Status' })).toBeEnabled())
      expect(replyBox()).toHaveValue('Still writing')
    })
  })

  describe('assignee', () => {
    const trigger = () => screen.getByRole('combobox', { name: 'Assigned To' })

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

      expect(await screen.findByRole('alert')).toHaveTextContent('Could not update ticket')
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

  describe('status and category', () => {
    const select = (name: string) => screen.getByRole('combobox', { name })

    async function choose(name: string, option: string) {
      await waitFor(() => expect(select(name)).toBeEnabled())
      fireEvent.click(select(name))
      const item = await screen.findByRole('option', { name: option })
      // Base UI ignores a mouse click on an option unless the press started on it.
      fireEvent.pointerDown(item)
      fireEvent.click(item)
    }

    async function optionsOf(name: string) {
      await waitFor(() => expect(select(name)).toBeEnabled())
      fireEvent.click(select(name))
      const options = await screen.findAllByRole('option')
      return options.map((option) => option.textContent)
    }

    it('offers the three statuses', async () => {
      mockApi(ticket)

      renderPage()
      await screen.findByRole('heading', { name: ticket.subject })

      expect(await optionsOf('Status')).toEqual(['Open', 'Resolved', 'Closed'])
    })

    it('offers the three categories to a categorized ticket, without Uncategorized', async () => {
      mockApi(ticket)

      renderPage()
      await screen.findByRole('heading', { name: ticket.subject })

      expect(await optionsOf('Category')).toEqual([
        'General Question',
        'Technical Question',
        'Refund Request',
      ])
    })

    it('shows Uncategorized as well while a ticket has no category', async () => {
      mockApi({ ...ticket, category: null })

      renderPage()
      await screen.findByRole('heading', { name: ticket.subject })

      expect(await optionsOf('Category')).toEqual([
        'Uncategorized',
        'General Question',
        'Technical Question',
        'Refund Request',
      ])
    })

    it('saves only the status when the status changes', async () => {
      mockApi(ticket, { ...ticket, status: 'closed' })
      const patch = vi.spyOn(axios, 'patch').mockResolvedValue({ data: {} })

      renderPage()
      await screen.findByRole('heading', { name: ticket.subject })
      await choose('Status', 'Closed')

      await waitFor(() => expect(patch).toHaveBeenCalledWith('/api/tickets/2', { status: 'closed' }))
      await waitFor(() => expect(select('Status')).toBeEnabled())
      expect(select('Status')).toHaveTextContent('Closed')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('saves only the category when the category changes', async () => {
      mockApi(ticket, { ...ticket, category: 'general_question' })
      const patch = vi.spyOn(axios, 'patch').mockResolvedValue({ data: {} })

      renderPage()
      await screen.findByRole('heading', { name: ticket.subject })
      await choose('Category', 'General Question')

      await waitFor(() =>
        expect(patch).toHaveBeenCalledWith('/api/tickets/2', { category: 'general_question' }),
      )
      await waitFor(() => expect(select('Category')).toHaveTextContent('General Question'))
    })

    it('saves nothing when Uncategorized is chosen again', async () => {
      mockApi({ ...ticket, category: null })
      const patch = vi.spyOn(axios, 'patch').mockResolvedValue({ data: {} })

      renderPage()
      await screen.findByRole('heading', { name: ticket.subject })
      await choose('Category', 'Uncategorized')

      expect(select('Category')).toHaveTextContent('Uncategorized')
      expect(patch).not.toHaveBeenCalled()
    })

    it('shows the choice and blocks every control while it saves', async () => {
      mockApi(ticket)
      vi.spyOn(axios, 'patch').mockReturnValue(new Promise(() => {}))

      renderPage()
      await screen.findByRole('heading', { name: ticket.subject })
      await choose('Status', 'Closed')

      await waitFor(() => expect(select('Status')).toBeDisabled())
      expect(select('Status')).toHaveTextContent('Closed')
      expect(select('Category')).toBeDisabled()
      expect(select('Assigned To')).toBeDisabled()
    })

    it.each([
      ['Status', 'Closed', 'Resolved'],
      ['Category', 'General Question', 'Refund Request'],
    ])('goes back to the saved %s and shows an error when saving fails', async (name, option, saved) => {
      mockApi(ticket)
      vi.spyOn(axios, 'patch').mockRejectedValue(new Error('Network Error'))

      renderPage()
      await screen.findByRole('heading', { name: ticket.subject })
      await choose(name, option)

      expect(await screen.findByRole('alert')).toHaveTextContent('Could not update ticket')
      expect(select(name)).toHaveTextContent(saved)
    })
  })
})
