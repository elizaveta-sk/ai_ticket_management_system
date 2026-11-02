import { fireEvent, screen, waitFor } from '@testing-library/react'
import axios, { AxiosError, type AxiosResponse } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '../test/render-with-query.tsx'
import ContactPage from './ContactPage.tsx'

const values = {
  name: 'Grace Student',
  email: 'grace@example.com',
  subject: 'Refund',
  message: 'Please refund me.',
}

function fillForm() {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: values.name } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: values.email } })
  fireEvent.change(screen.getByLabelText('Subject'), { target: { value: values.subject } })
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: values.message } })
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
}

describe('ContactPage', () => {
  it('sends the message and confirms it was received', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { received: true } })
    renderWithQuery(<ContactPage />)

    fillForm()
    submit()

    expect(await screen.findByRole('status')).toHaveTextContent("we've received your message")
    expect(post).toHaveBeenCalledWith('/api/contact', { ...values, website: '' })
    expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument()
  })

  it('shows an empty form after choosing to send another message', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { received: true } })
    renderWithQuery(<ContactPage />)

    fillForm()
    submit()
    fireEvent.click(await screen.findByRole('button', { name: 'Send another message' }))

    expect(await screen.findByLabelText('Message')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument()
  })

  it('shows what is missing and sends nothing when the form is empty', async () => {
    const post = vi.spyOn(axios, 'post')
    renderWithQuery(<ContactPage />)

    submit()

    expect(await screen.findByText('Enter your name')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByText('Enter a subject')).toBeInTheDocument()
    expect(screen.getByText('Enter a message')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('shows the server error and keeps what was typed', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(
      new AxiosError('Request failed', undefined, undefined, undefined, {
        status: 429,
        data: { error: 'Too many requests. Please try again shortly.' },
      } as AxiosResponse),
    )
    renderWithQuery(<ContactPage />)

    fillForm()
    submit()

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests')
    await waitFor(() => expect(screen.getByLabelText('Message')).toHaveValue(values.message))
  })

  it('keeps the spam trap out of reach of keyboard users', () => {
    renderWithQuery(<ContactPage />)

    expect(screen.getByLabelText('Website')).toHaveAttribute('tabindex', '-1')
  })
})
