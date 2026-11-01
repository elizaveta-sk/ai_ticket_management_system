import { fireEvent, screen, waitFor } from '@testing-library/react'
import axios, { AxiosError, type AxiosResponse } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { renderWithQuery } from '../test/render-with-query.tsx'
import CreateUserForm from './CreateUserForm.tsx'

const validValues = { name: 'Alan Agent', email: 'alan@example.com', password: 'password123' }

// The form's Cancel button only works inside a dialog.
function renderForm() {
  const onCreated = vi.fn()
  renderWithQuery(
    <Dialog open>
      <DialogContent>
        <CreateUserForm onCreated={onCreated} />
      </DialogContent>
    </Dialog>,
  )
  return { onCreated }
}

function fillForm(values: Partial<typeof validValues> = {}) {
  const { name, email, password } = { ...validValues, ...values }
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: name } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Create user' }))
}

function serverError(error: unknown) {
  return new AxiosError('Request failed', undefined, undefined, undefined, {
    status: 409,
    data: { error },
  } as AxiosResponse)
}

describe('CreateUserForm', () => {
  it('starts with empty fields and hides the password as it is typed', () => {
    renderForm()

    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.getByLabelText('Email')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  describe('validation', () => {
    it('shows an error for every field when submitted empty, and sends nothing', async () => {
      const post = vi.spyOn(axios, 'post')
      renderForm()

      submit()

      expect(await screen.findByText('Name must be at least 3 characters')).toBeInTheDocument()
      expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
      expect(post).not.toHaveBeenCalled()
    })

    it.each([
      ['a 2 character name', { name: 'Al' }, 'Name must be at least 3 characters'],
      ['a name padded with spaces', { name: '  Al  ' }, 'Name must be at least 3 characters'],
      ['an invalid email', { email: 'not-an-email' }, 'Enter a valid email address'],
      ['a 7 character password', { password: 'a'.repeat(7) }, 'Password must be at least 8 characters'],
      ['a 129 character password', { password: 'a'.repeat(129) }, 'Password must be at most 128 characters'],
    ])('rejects %s', async (_label, values, message) => {
      const post = vi.spyOn(axios, 'post')
      renderForm()

      fillForm(values)
      submit()

      expect(await screen.findByText(message)).toBeInTheDocument()
      expect(post).not.toHaveBeenCalled()
    })

    it('marks only the invalid field as invalid', async () => {
      vi.spyOn(axios, 'post')
      renderForm()

      fillForm({ name: 'Al' })
      submit()

      await screen.findByText('Name must be at least 3 characters')
      expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'false')
      expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'false')
    })

    it('clears the error once the field is corrected', async () => {
      vi.spyOn(axios, 'post')
      renderForm()

      fillForm({ name: 'Al' })
      submit()
      await screen.findByText('Name must be at least 3 characters')

      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alan' } })

      await waitFor(() =>
        expect(screen.queryByText('Name must be at least 3 characters')).not.toBeInTheDocument(),
      )
    })

    it('accepts values exactly at the minimum lengths', async () => {
      const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: {} })
      renderForm()

      fillForm({ name: 'Ann', password: 'a'.repeat(8) })
      submit()

      await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    })

    it('accepts a password exactly at the maximum length', async () => {
      const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: {} })
      renderForm()

      fillForm({ password: 'a'.repeat(128) })
      submit()

      await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    })
  })

  describe('submitting', () => {
    it('posts the values to /api/users and calls onCreated', async () => {
      const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: {} })
      const { onCreated } = renderForm()

      fillForm()
      submit()

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
      expect(post).toHaveBeenCalledWith('/api/users', validValues)
    })

    it('trims the name and lowercases the email before sending', async () => {
      const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: {} })
      renderForm()

      fillForm({ name: '  Alan Agent  ', email: 'Alan@Example.COM' })
      submit()

      await waitFor(() => expect(post).toHaveBeenCalledWith('/api/users', validValues))
    })

    it('does not change the password before sending', async () => {
      const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: {} })
      renderForm()

      fillForm({ password: '  PassWord123  ' })
      submit()

      await waitFor(() =>
        expect(post).toHaveBeenCalledWith('/api/users', {
          ...validValues,
          password: '  PassWord123  ',
        }),
      )
    })

    it('disables the submit button while the request is in progress', async () => {
      vi.spyOn(axios, 'post').mockReturnValue(new Promise(() => {}))
      const { onCreated } = renderForm()

      fillForm()
      submit()

      expect(await screen.findByRole('button', { name: 'Creating...' })).toBeDisabled()
      expect(onCreated).not.toHaveBeenCalled()
    })
  })

  describe('server errors', () => {
    it('shows the message from the server and does not call onCreated', async () => {
      vi.spyOn(axios, 'post').mockRejectedValue(
        serverError('A user with this email already exists'),
      )
      const { onCreated } = renderForm()

      fillForm()
      submit()

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'A user with this email already exists',
      )
      expect(onCreated).not.toHaveBeenCalled()
    })

    it.each([
      ['the request fails without a response', new Error('Network Error')],
      ['the server sends no error message', serverError(undefined)],
      ['the error is not a string', serverError({ code: 500 })],
    ])('shows a generic message when %s', async (_label, error) => {
      vi.spyOn(axios, 'post').mockRejectedValue(error)
      renderForm()

      fillForm()
      submit()

      expect(await screen.findByRole('alert')).toHaveTextContent('Could not create user')
    })

    it('keeps the entered values and lets the user try again', async () => {
      const post = vi
        .spyOn(axios, 'post')
        .mockRejectedValueOnce(new Error('Network Error'))
        .mockResolvedValueOnce({ data: {} })
      const { onCreated } = renderForm()

      fillForm()
      submit()
      await screen.findByRole('alert')

      expect(screen.getByLabelText('Name')).toHaveValue(validValues.name)
      expect(screen.getByLabelText('Email')).toHaveValue(validValues.email)
      expect(screen.getByLabelText('Password')).toHaveValue(validValues.password)

      submit()

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
      expect(post).toHaveBeenCalledTimes(2)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})
