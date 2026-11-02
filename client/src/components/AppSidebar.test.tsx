import { screen } from '@testing-library/react'
import axios from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '../test/render-with-query.tsx'
import AppSidebar from './AppSidebar.tsx'

const counts = {
  open: 26,
  mine: 6,
  unassigned: 11,
  refunds: 3,
  resolved_by_ai: 38,
  resolved_by_agent: 24,
  closed: 112,
  all: 200,
}

function renderSidebar({ isAdmin = false, route = '/tickets' } = {}) {
  return renderWithQuery(<AppSidebar userName="Ada Agent" isAdmin={isAdmin} onSignOut={() => {}} />, {
    route,
  })
}

describe('AppSidebar', () => {
  it('shows each view with its count once they load', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { counts } })

    renderSidebar()

    const link = await screen.findByRole('link', { name: 'Needs a person 26' })
    expect(link).toHaveAttribute('href', '/tickets')
    expect(screen.getByRole('link', { name: 'Closed 112' })).toHaveAttribute(
      'href',
      '/tickets?view=closed',
    )
  })

  it('still shows the views when the counts cannot load', async () => {
    const get = vi.spyOn(axios, 'get').mockRejectedValue(new Error('Network Error'))

    renderSidebar()

    expect(screen.getByRole('link', { name: 'Needs a person' })).toBeInTheDocument()
    await vi.waitFor(() => expect(get).toHaveBeenCalled())
    expect(screen.getByRole('link', { name: 'Needs a person' })).toBeInTheDocument()
  })

  it('marks the view in the URL as current, including while a ticket is open', () => {
    vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))

    renderSidebar({ route: '/tickets/7?view=refunds' })

    expect(screen.getByRole('link', { name: 'Refund requests' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Needs a person' })).not.toHaveAttribute('aria-current')
  })

  it('marks no view as current on other pages', () => {
    vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))

    renderSidebar({ route: '/dashboard' })

    expect(screen.getByRole('link', { name: 'Needs a person' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
  })

  it('gives agents Assigned to me and no Users link', () => {
    vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))

    renderSidebar()

    expect(screen.getByRole('link', { name: 'Assigned to me' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument()
  })

  it('gives admins a Users link and no Assigned to me', () => {
    vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))

    renderSidebar({ isAdmin: true })

    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Assigned to me' })).not.toBeInTheDocument()
  })
})
