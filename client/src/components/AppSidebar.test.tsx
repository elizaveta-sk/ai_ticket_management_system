import { screen, within } from '@testing-library/react'
import axios from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '../test/render-with-query.tsx'
import AppSidebar from './AppSidebar.tsx'

const counts = { attention: 26, refunds: 3, resolved: 62, closed: 112, all: 203 }

function renderSidebar({ isAdmin = false, route = '/tickets' } = {}) {
  return renderWithQuery(<AppSidebar userName="Ada Agent" isAdmin={isAdmin} onSignOut={() => {}} />, {
    route,
  })
}

describe('AppSidebar', () => {
  it('shows each view with its count once they load', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { counts } })

    renderSidebar()

    const link = await screen.findByRole('link', { name: 'Need attention 26' })
    expect(link).toHaveAttribute('href', '/tickets')
    expect(screen.getByRole('link', { name: 'Closed 112' })).toHaveAttribute(
      'href',
      '/tickets?view=closed',
    )
  })

  it('still shows the views when the counts cannot load', async () => {
    const get = vi.spyOn(axios, 'get').mockRejectedValue(new Error('Network Error'))

    renderSidebar()

    expect(screen.getByRole('link', { name: 'Need attention' })).toBeInTheDocument()
    await vi.waitFor(() => expect(get).toHaveBeenCalled())
    expect(screen.getByRole('link', { name: 'Need attention' })).toBeInTheDocument()
  })

  it('marks the view in the URL as current, including while a ticket is open', () => {
    vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))

    renderSidebar({ route: '/tickets/7?view=refunds' })

    expect(screen.getByRole('link', { name: 'Refund requests' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Need attention' })).not.toHaveAttribute('aria-current')
  })

  it('marks no view as current on other pages', () => {
    vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))

    renderSidebar({ route: '/dashboard' })

    expect(screen.getByRole('link', { name: 'Need attention' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
  })

  it('lists each view once, with work to do first', () => {
    vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))

    renderSidebar()

    const views = within(screen.getByRole('navigation', { name: 'Tickets' })).getAllByRole('link')
    expect(views.map((link) => link.textContent?.trim())).toEqual([
      'Need attention',
      'Refund requests',
      'Resolved',
      'Closed',
      'All tickets',
    ])
  })

  it('gives only admins a Users link', () => {
    vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))

    const { unmount } = renderSidebar()
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument()
    unmount()

    renderSidebar({ isAdmin: true })
    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument()
  })
})
