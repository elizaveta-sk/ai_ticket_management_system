import { screen } from '@testing-library/react'
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
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { ticket } })

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
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { ticket } })

    renderPage()

    const body = await screen.findByText(/Please refund my course/)
    expect(body.textContent).toBe(ticket.body)
    expect(body).toHaveClass('whitespace-pre-wrap')
  })

  it('shows markup in a message as text', async () => {
    const body = '<img src=x onerror=alert(1)> hello'
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { ticket: { ...ticket, body } } })

    renderPage()

    expect(await screen.findByText(body)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows Uncategorized for a ticket without a category', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { ticket: { ...ticket, category: null } } })

    renderPage()

    expect(await screen.findByText('Uncategorized')).toBeInTheDocument()
  })

  it('says so when the email has no message', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { ticket: { ...ticket, body: '' } } })

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
})
