import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import axios from 'axios'
import { ticketReplyMaxLength, type TicketReply } from 'core/tickets'
import { describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '../test/render-with-query.tsx'
import TicketReplies from './TicketReplies.tsx'

const agentReply: TicketReply = {
  id: 1,
  body: 'Hi Grace,\n\nWe are looking into it.',
  bodyHtml: null,
  senderType: 'agent',
  createdAt: '2026-03-02T13:00:00.000Z',
  author: { name: 'Ada Agent' },
}

const customerReply: TicketReply = {
  id: 2,
  body: 'Thank you!',
  bodyHtml: null,
  senderType: 'customer',
  createdAt: '2026-03-03T10:00:00.000Z',
  author: null,
}

function renderReplies(replies: TicketReply[] = []) {
  return renderWithQuery(<TicketReplies ticketId={2} senderName="Grace Student" replies={replies} />)
}

const replyBox = () => screen.getByRole('textbox', { name: 'Your reply' })
const sendButton = () => screen.getByRole('button', { name: 'Send reply' })

function send(text: string) {
  fireEvent.change(replyBox(), { target: { value: text } })
  fireEvent.click(sendButton())
}

function serverError(status: number, error: string) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: { error } },
  })
}

describe('TicketReplies', () => {
  describe('thread', () => {
    it('says so when there are no replies, and still offers the form', () => {
      renderReplies()

      expect(screen.getByRole('region', { name: 'Replies' })).toBeInTheDocument()
      expect(screen.getByText('No replies yet.')).toBeInTheDocument()
      expect(screen.queryByRole('list')).not.toBeInTheDocument()
      expect(replyBox()).toBeInTheDocument()
    })

    it('shows the replies in the order given, with their text and time', () => {
      renderReplies([agentReply, customerReply])

      const items = screen.getAllByRole('listitem')
      expect(items).toHaveLength(2)
      expect(items[0]).toHaveTextContent('We are looking into it.')
      expect(items[0]).toHaveTextContent(new Date(agentReply.createdAt).toLocaleString())
      expect(items[1]).toHaveTextContent('Thank you!')
      expect(items[1]).toHaveTextContent(new Date(customerReply.createdAt).toLocaleString())
      expect(screen.queryByText('No replies yet.')).not.toBeInTheDocument()
    })

    it('shows an agent reply under its author, labelled Agent', () => {
      renderReplies([agentReply])

      const item = within(screen.getByRole('listitem'))
      expect(item.getByText('Ada Agent')).toBeInTheDocument()
      expect(item.getByText('Agent')).toBeInTheDocument()
      expect(item.queryByText('Customer')).not.toBeInTheDocument()
      expect(item.queryByText('Grace Student')).not.toBeInTheDocument()
    })

    it('shows a customer reply under the sender name, labelled Customer', () => {
      renderReplies([customerReply])

      const item = within(screen.getByRole('listitem'))
      expect(item.getByText('Grace Student')).toBeInTheDocument()
      expect(item.getByText('Customer')).toBeInTheDocument()
      expect(item.queryByText('Agent')).not.toBeInTheDocument()
    })

    it('keeps the line breaks in a reply', () => {
      renderReplies([agentReply])

      const body = screen.getByText(/We are looking into it/)
      expect(body.textContent).toBe(agentReply.body)
      expect(body).toHaveClass('whitespace-pre-wrap')
    })

    it('shows markup in a reply as text', () => {
      const body = '<img src=x onerror=alert(1)> hello'

      renderReplies([{ ...agentReply, body }])

      expect(screen.getByText(body)).toBeInTheDocument()
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
    })
  })

  describe('form', () => {
    it('sends the trimmed reply to this ticket and clears the box', async () => {
      const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: {} })

      renderReplies()
      send('  Your refund is on its way.\n')

      await waitFor(() => expect(replyBox()).toHaveValue(''))
      expect(post).toHaveBeenCalledTimes(1)
      expect(post).toHaveBeenCalledWith('/api/tickets/2/replies', {
        body: 'Your refund is on its way.',
      })
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('keeps the line breaks inside a reply it sends', async () => {
      const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: {} })

      renderReplies()
      send('First line\n\nSecond line')

      await waitFor(() =>
        expect(post).toHaveBeenCalledWith('/api/tickets/2/replies', {
          body: 'First line\n\nSecond line',
        }),
      )
    })

    it('disables sending and polishing until there is a reply', () => {
      renderReplies()

      expect(sendButton()).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Polish' })).toBeDisabled()

      fireEvent.change(replyBox(), { target: { value: 'Hello' } })

      expect(sendButton()).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Polish' })).toBeEnabled()
    })

    it('disables sending and polishing for a reply of only whitespace, with no error', () => {
      renderReplies()
      fireEvent.change(replyBox(), { target: { value: ' \n ' } })

      expect(sendButton()).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Polish' })).toBeDisabled()
      expect(screen.queryByText('Reply is required')).not.toBeInTheDocument()
    })

    it('disables sending again once the reply is sent', async () => {
      vi.spyOn(axios, 'post').mockResolvedValue({ data: {} })

      renderReplies()
      send('Hello')

      await waitFor(() => expect(replyBox()).toHaveValue(''))
      expect(sendButton()).toBeDisabled()
    })

    it('does not send a reply over the maximum length', async () => {
      const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: {} })

      renderReplies()
      send('a'.repeat(ticketReplyMaxLength + 1))

      expect(
        await screen.findByText(`Reply must be at most ${ticketReplyMaxLength} characters`),
      ).toBeInTheDocument()
      expect(post).not.toHaveBeenCalled()
    })

    it('removes the validation message once the reply is valid', async () => {
      const tooLong = `Reply must be at most ${ticketReplyMaxLength} characters`

      renderReplies()
      send('a'.repeat(ticketReplyMaxLength + 1))
      await screen.findByText(tooLong)
      fireEvent.change(replyBox(), { target: { value: 'Hello' } })

      await waitFor(() => expect(screen.queryByText(tooLong)).not.toBeInTheDocument())
      expect(replyBox()).toHaveAttribute('aria-invalid', 'false')
    })

    it('blocks a second send and further typing while the reply sends', async () => {
      vi.spyOn(axios, 'post').mockReturnValue(new Promise(() => {}))

      renderReplies()
      send('Hello')

      expect(await screen.findByRole('button', { name: 'Sending...' })).toBeDisabled()
      expect(replyBox()).toHaveAttribute('readonly')
      expect(replyBox()).toHaveValue('Hello')
    })

    it('shows the server error and keeps the draft when sending fails', async () => {
      vi.spyOn(axios, 'post').mockRejectedValue(serverError(404, 'Ticket not found'))

      renderReplies()
      send('Hello')

      expect(await screen.findByRole('alert')).toHaveTextContent('Ticket not found')
      expect(replyBox()).toHaveValue('Hello')
      expect(replyBox()).not.toHaveAttribute('readonly')
      expect(sendButton()).toBeEnabled()
    })

    it('shows a general message when sending fails without a server message', async () => {
      vi.spyOn(axios, 'post').mockRejectedValue(new Error('Network Error'))

      renderReplies()
      send('Hello')

      expect(await screen.findByRole('alert')).toHaveTextContent('Could not send reply')
    })

    it('can send again after a failure, which removes the error', async () => {
      const post = vi
        .spyOn(axios, 'post')
        .mockRejectedValueOnce(new Error('Network Error'))
        .mockResolvedValueOnce({ data: {} })

      renderReplies()
      send('Hello')
      await screen.findByRole('alert')
      fireEvent.click(sendButton())

      await waitFor(() => expect(replyBox()).toHaveValue(''))
      expect(post).toHaveBeenCalledTimes(2)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('polish', () => {
    const polishButton = () => screen.getByRole('button', { name: 'Polish' })

    function polish(text: string) {
      fireEvent.change(replyBox(), { target: { value: text } })
      fireEvent.click(polishButton())
    }

    it('offers Polish before Send reply', () => {
      renderReplies()

      const buttons = screen.getAllByRole('button').map((button) => button.textContent)
      expect(buttons).toEqual(['Polish', 'Send reply'])
    })

    it('replaces the draft with the polished reply without sending it', async () => {
      const post = vi
        .spyOn(axios, 'post')
        .mockResolvedValue({ data: { body: 'Your refund has been issued.' } })

      renderReplies()
      polish('  refund done\n')

      await waitFor(() => expect(replyBox()).toHaveValue('Your refund has been issued.'))
      expect(post).toHaveBeenCalledTimes(1)
      expect(post).toHaveBeenCalledWith('/api/tickets/2/replies/polish', { body: 'refund done' })
      expect(replyBox()).not.toHaveAttribute('readonly')
      expect(sendButton()).toBeEnabled()
    })

    it('sends the polished reply', async () => {
      const post = vi
        .spyOn(axios, 'post')
        .mockResolvedValueOnce({ data: { body: 'Your refund has been issued.' } })
        .mockResolvedValueOnce({ data: {} })

      renderReplies()
      polish('refund done')
      await waitFor(() => expect(replyBox()).toHaveValue('Your refund has been issued.'))
      fireEvent.click(sendButton())

      await waitFor(() => expect(replyBox()).toHaveValue(''))
      expect(post).toHaveBeenLastCalledWith('/api/tickets/2/replies', {
        body: 'Your refund has been issued.',
      })
    })

    it('blocks sending, polishing and typing while it polishes', async () => {
      vi.spyOn(axios, 'post').mockReturnValue(new Promise(() => {}))

      renderReplies()
      polish('Hello')

      expect(await screen.findByRole('button', { name: 'Polishing...' })).toBeDisabled()
      expect(sendButton()).toBeDisabled()
      expect(replyBox()).toHaveAttribute('readonly')
      expect(replyBox()).toHaveValue('Hello')
    })

    it('blocks polishing while the reply sends', async () => {
      vi.spyOn(axios, 'post').mockReturnValue(new Promise(() => {}))

      renderReplies()
      send('Hello')

      await screen.findByRole('button', { name: 'Sending...' })
      expect(polishButton()).toBeDisabled()
    })

    it('shows the server error and keeps the draft when polishing fails', async () => {
      vi.spyOn(axios, 'post').mockRejectedValue(
        serverError(503, 'Reply polishing is not configured'),
      )

      renderReplies()
      polish('Hello')

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Reply polishing is not configured',
      )
      expect(replyBox()).toHaveValue('Hello')
      expect(replyBox()).not.toHaveAttribute('readonly')
      expect(polishButton()).toBeEnabled()
    })

    it('shows the rate limit message and lets the agent keep the draft', async () => {
      vi.spyOn(axios, 'post').mockRejectedValue(
        serverError(429, 'Too many requests. Please try again shortly.'),
      )

      renderReplies()
      polish('Hello')

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Too many requests. Please try again shortly.',
      )
      expect(replyBox()).toHaveValue('Hello')
      expect(sendButton()).toBeEnabled()
    })

    it('polishes the box as it stands when polished again', async () => {
      const post = vi
        .spyOn(axios, 'post')
        .mockResolvedValueOnce({ data: { body: 'Hi Grace,\n\nDone.' } })
        .mockResolvedValueOnce({ data: { body: 'Hi Grace,\n\nAll done.' } })

      renderReplies()
      polish('done')
      await waitFor(() => expect(replyBox()).toHaveValue('Hi Grace,\n\nDone.'))
      fireEvent.click(polishButton())

      await waitFor(() => expect(replyBox()).toHaveValue('Hi Grace,\n\nAll done.'))
      expect(post).toHaveBeenLastCalledWith('/api/tickets/2/replies/polish', {
        body: 'Hi Grace,\n\nDone.',
      })
    })

    it('shows a general message when polishing fails without a server message', async () => {
      vi.spyOn(axios, 'post').mockRejectedValue(new Error('Network Error'))

      renderReplies()
      polish('Hello')

      expect(await screen.findByRole('alert')).toHaveTextContent('Could not polish the reply')
    })

    it('removes a polish error when the reply is sent instead', async () => {
      vi.spyOn(axios, 'post')
        .mockRejectedValueOnce(new Error('Network Error'))
        .mockResolvedValueOnce({ data: {} })

      renderReplies()
      polish('Hello')
      await screen.findByRole('alert')
      fireEvent.click(sendButton())

      await waitFor(() => expect(replyBox()).toHaveValue(''))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('removes a send error when the reply is polished instead', async () => {
      vi.spyOn(axios, 'post')
        .mockRejectedValueOnce(new Error('Network Error'))
        .mockResolvedValueOnce({ data: { body: 'Hello there.' } })

      renderReplies()
      send('Hello')
      await screen.findByRole('alert')
      fireEvent.click(polishButton())

      await waitFor(() => expect(replyBox()).toHaveValue('Hello there.'))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})
