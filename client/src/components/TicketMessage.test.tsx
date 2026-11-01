import { fireEvent, screen, waitFor } from '@testing-library/react'
import axios from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '../test/render-with-query.tsx'
import TicketMessage from './TicketMessage.tsx'

function renderMessage(body = 'Please refund my course.') {
  return renderWithQuery(<TicketMessage ticketId={2} body={body} />)
}

const summarizeButton = () => screen.getByRole('button', { name: 'Summarize' })

function serverError(status: number, error: string) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: { error } },
  })
}

describe('TicketMessage', () => {
  it('shows the message with its line breaks, and no summary yet', () => {
    const post = vi.spyOn(axios, 'post')

    renderMessage('Hello,\n\nPlease refund me.')

    const message = screen.getByText(/Please refund me/)
    expect(message.textContent).toBe('Hello,\n\nPlease refund me.')
    expect(message).toHaveClass('whitespace-pre-wrap')
    expect(screen.queryByRole('region', { name: 'Summary' })).not.toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('says so when the email has no message, and can still summarize', () => {
    renderMessage('')

    expect(screen.getByText('This email has no message.')).toBeInTheDocument()
    expect(summarizeButton()).toBeEnabled()
  })

  it('requests a summary of this ticket and shows it', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { summary: 'The student wants a refund.' } })

    renderMessage()
    fireEvent.click(summarizeButton())

    expect(await screen.findByRole('region', { name: 'Summary' })).toHaveTextContent(
      'The student wants a refund.',
    )
    expect(post).toHaveBeenCalledWith('/api/tickets/2/summary')
  })

  it('generates a new summary on every click, replacing the last one', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValueOnce({ data: { summary: 'First summary.' } })
      .mockResolvedValueOnce({ data: { summary: 'Second summary.' } })

    renderMessage()
    fireEvent.click(summarizeButton())
    await screen.findByText('First summary.')
    fireEvent.click(summarizeButton())

    expect(await screen.findByText('Second summary.')).toBeInTheDocument()
    expect(screen.queryByText('First summary.')).not.toBeInTheDocument()
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('shows a loading state and blocks another click while it summarizes', async () => {
    vi.spyOn(axios, 'post').mockReturnValue(new Promise(() => {}))

    renderMessage()
    fireEvent.click(summarizeButton())

    expect(await screen.findByRole('button', { name: 'Summarizing...' })).toBeDisabled()
    expect(screen.getByTestId('summary-loading')).toBeInTheDocument()
  })

  it('removes any markup from the summary', async () => {
    const summary = '<img src=x onerror=alert(1)>The student wants a refund.'
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { summary } })

    renderMessage()
    fireEvent.click(summarizeButton())

    expect(await screen.findByText('The student wants a refund.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('puts the button underneath the message, outside its card', () => {
    renderMessage()

    const card = screen.getByText('Please refund my course.').closest('[data-slot="card"]')
    expect(card).toBeInTheDocument()
    expect(card).not.toContainElement(summarizeButton())
  })

  it('shows the server error and can try again, which removes it', async () => {
    vi.spyOn(axios, 'post')
      .mockRejectedValueOnce(serverError(429, 'Too many requests. Please try again shortly.'))
      .mockResolvedValueOnce({ data: { summary: 'A summary.' } })

    renderMessage()
    fireEvent.click(summarizeButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many requests. Please try again shortly.',
    )
    fireEvent.click(summarizeButton())

    await screen.findByText('A summary.')
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('shows a general message when it fails without a server message', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('Network Error'))

    renderMessage()
    fireEvent.click(summarizeButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not summarize the ticket')
  })
})
