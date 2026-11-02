import { screen } from '@testing-library/react'
import axios from 'axios'
import type { TicketStats } from 'core/tickets'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '../test/render-with-query.tsx'
import DashboardPage from './DashboardPage.tsx'

const stats: TicketStats = {
  total: 120,
  open: 37,
  resolvedByAi: 30,
  resolvedByAiPercent: 25,
  averageResolutionSeconds: 5_400,
  ticketsPerDay: [
    { date: '2026-10-31', count: 0 },
    { date: '2026-11-01', count: 4 },
    { date: '2026-11-02', count: 7 },
  ],
}

// jsdom doesn't have this, and the chart needs it to measure itself.
beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

function valueOf(label: string) {
  return screen.getByText(label).closest('[data-slot="card"]')?.querySelector('dd')?.textContent
}

describe('DashboardPage', () => {
  it('shows every tile with a placeholder while loading', () => {
    vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))

    const { container } = renderWithQuery(<DashboardPage />)

    expect(screen.getByText('Total tickets')).toBeInTheDocument()
    expect(screen.getByText('Tickets per day')).toBeInTheDocument()
    // One for each of the five tiles, and one for the chart.
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(6)
  })

  it('gives each day of the chart as a table, with the dates in UTC', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { stats } })

    renderWithQuery(<DashboardPage />)

    const table = await screen.findByRole('table', { name: 'Tickets per day' })
    const rows = Array.from(table.querySelectorAll('tbody tr')).map((row) =>
      Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent),
    )
    expect(rows).toEqual([
      ['Oct 31', '0'],
      ['Nov 1', '4'],
      ['Nov 2', '7'],
    ])
  })

  it('says so instead of showing an empty chart when no day has tickets', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({
      data: { stats: { ...stats, ticketsPerDay: [{ date: '2026-11-02', count: 0 }] } },
    })

    renderWithQuery(<DashboardPage />)

    expect(await screen.findByText('No tickets in the last 30 days')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
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
          ticketsPerDay: [],
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
