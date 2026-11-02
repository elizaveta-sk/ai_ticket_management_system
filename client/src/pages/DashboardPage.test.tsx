import { screen } from '@testing-library/react'
import axios from 'axios'
import type { TicketStats } from 'core/tickets'
import { describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '../test/render-with-query.tsx'
import DashboardPage from './DashboardPage.tsx'

const stats: TicketStats = {
  total: 120,
  open: 37,
  resolvedByAi: 30,
  resolvedByAiPercent: 25,
  averageResolutionSeconds: 5_400,
}

function valueOf(label: string) {
  return screen.getByText(label).closest('[data-slot="card"]')?.querySelector('dd')?.textContent
}

describe('DashboardPage', () => {
  it('shows every tile with a placeholder while loading', () => {
    vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))

    const { container } = renderWithQuery(<DashboardPage />)

    expect(screen.getByText('Total tickets')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(5)
  })

  it('requests the stats and shows each number', async () => {
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { stats } })

    renderWithQuery(<DashboardPage />)

    expect(await screen.findByText('120')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/api/tickets/stats')
    expect(valueOf('Total tickets')).toBe('120')
    expect(valueOf('Open tickets')).toBe('37')
    expect(valueOf('Resolved by AI')).toBe('30')
    expect(valueOf('% resolved by AI')).toBe('25%')
    expect(valueOf('Average resolution time')).toBe('1h 30m')
  })

  it('shows zeros, and a dash for what cannot be worked out, when there are no tickets', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({
      data: {
        stats: {
          total: 0,
          open: 0,
          resolvedByAi: 0,
          resolvedByAiPercent: null,
          averageResolutionSeconds: null,
        },
      },
    })

    renderWithQuery(<DashboardPage />)

    await screen.findAllByText('—')
    expect(valueOf('Total tickets')).toBe('0')
    expect(valueOf('% resolved by AI')).toBe('—')
    expect(valueOf('Average resolution time')).toBe('—')
  })

  it('shows an error when the stats fail to load', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(new Error('Network Error'))

    renderWithQuery(<DashboardPage />)

    expect(await screen.findByText('Could not load the dashboard')).toBeInTheDocument()
  })
})
