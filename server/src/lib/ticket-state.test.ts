import { afterEach, describe, expect, it, vi } from 'vitest'
import { prisma } from './prisma.ts'
import { moveTicket } from './ticket-state.ts'

vi.mock('./prisma.ts', () => ({ prisma: { ticket: { updateMany: vi.fn() } } }))

afterEach(() => {
  vi.mocked(prisma.ticket.updateMany).mockReset()
})

describe('moveTicket', () => {
  it.each([
    ['new', 'processing'],
    ['processing', 'open'],
    ['processing', 'resolved'],
  ] as const)('moves a ticket from %s to %s', async (from, to) => {
    vi.mocked(prisma.ticket.updateMany).mockResolvedValue({ count: 1 } as never)

    await expect(moveTicket(7, from, to)).resolves.toBe(true)

    expect(prisma.ticket.updateMany).toHaveBeenCalledWith({
      where: { id: 7, status: from },
      data: { status: to },
    })
  })

  it('reports false when the ticket has already left that state', async () => {
    vi.mocked(prisma.ticket.updateMany).mockResolvedValue({ count: 0 } as never)

    await expect(moveTicket(7, 'new', 'processing')).resolves.toBe(false)
  })

  it.each([
    ['new', 'resolved'],
    ['new', 'open'],
    ['processing', 'closed'],
    ['open', 'processing'],
    ['resolved', 'new'],
  ] as const)('refuses to move a ticket from %s to %s', async (from, to) => {
    await expect(moveTicket(7, from, to)).rejects.toThrow(`from ${from} to ${to}`)

    expect(prisma.ticket.updateMany).not.toHaveBeenCalled()
  })
})
