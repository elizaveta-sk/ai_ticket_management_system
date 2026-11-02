import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { autoResolveTicket } from './auto-resolve-ticket.ts'
import { classifyTicketInBackground } from './classify-ticket.ts'
import { isOpenAIConfigured } from './openai.ts'
import {
  initialTicketStatus,
  processTicketInBackground,
  startTicketSweep,
  sweepTickets,
} from './process-ticket.ts'
import { prisma } from './prisma.ts'

vi.mock('./auto-resolve-ticket.ts', () => ({ autoResolveTicket: vi.fn() }))
vi.mock('./classify-ticket.ts', () => ({ classifyTicketInBackground: vi.fn() }))
vi.mock('./openai.ts', () => ({ isOpenAIConfigured: vi.fn() }))
vi.mock('./prisma.ts', () => ({
  prisma: {
    $transaction: vi.fn(),
    ticket: { findMany: vi.fn(), updateMany: vi.fn() },
    user: { findFirst: vi.fn() },
  },
}))

const ticket = { id: 7, subject: 'Videos', body: 'Can I download videos?' }

const moved = (id: number, from: string, to: string) => ({
  where: { id, status: from },
  data: { status: to },
})

const assignedToAi = (id: number) => ({
  where: { id, assignedToId: null },
  data: { assignedToId: 'jane-ai' },
})

const unassigned = (id: number) => ({
  where: { id, assignedToId: 'jane-ai' },
  data: { assignedToId: null },
})

// The sweep's three queries, in the order it makes them.
function sweepFinds(stuck: object[], waiting: object[], uncategorized: object[]) {
  vi.mocked(prisma.ticket.findMany)
    .mockResolvedValueOnce(stuck as never)
    .mockResolvedValueOnce(waiting as never)
    .mockResolvedValueOnce(uncategorized as never)
}

beforeEach(() => {
  vi.mocked(isOpenAIConfigured).mockReturnValue(true)
  vi.mocked(classifyTicketInBackground).mockResolvedValue('general_question')
  vi.mocked(autoResolveTicket).mockResolvedValue(false)
  vi.mocked(prisma.ticket.findMany).mockResolvedValue([])
  vi.mocked(prisma.ticket.updateMany).mockResolvedValue({ count: 1 } as never)
  vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'jane-ai' } as never)
  vi.mocked(prisma.$transaction).mockImplementation(((queries: Promise<unknown>[]) =>
    Promise.all(queries)) as never)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.mocked(autoResolveTicket).mockReset()
  vi.mocked(classifyTicketInBackground).mockReset()
  vi.mocked(prisma.$transaction).mockReset()
  vi.mocked(prisma.ticket.findMany).mockReset()
  vi.mocked(prisma.ticket.updateMany).mockReset()
  vi.mocked(prisma.user.findFirst).mockReset()
})

describe('initialTicketStatus', () => {
  it('starts a ticket as new when a model can process it', () => {
    expect(initialTicketStatus()).toBe('new')
  })

  it('starts a ticket as open when nothing can process it', () => {
    vi.mocked(isOpenAIConfigured).mockReturnValue(false)

    expect(initialTicketStatus()).toBe('open')
  })
})

describe('processTicketInBackground', () => {
  it('moves the ticket to processing before the models run', async () => {
    await processTicketInBackground(ticket)

    expect(prisma.ticket.updateMany).toHaveBeenNthCalledWith(1, moved(7, 'new', 'processing'))
    expect(vi.mocked(prisma.ticket.updateMany).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(classifyTicketInBackground).mock.invocationCallOrder[0],
    )
  })

  it('assigns the ticket to the AI agent before the models run', async () => {
    await processTicketInBackground(ticket)

    expect(prisma.ticket.updateMany).toHaveBeenNthCalledWith(2, assignedToAi(7))
    expect(vi.mocked(prisma.ticket.updateMany).mock.invocationCallOrder[1]).toBeLessThan(
      vi.mocked(classifyTicketInBackground).mock.invocationCallOrder[0],
    )
  })

  it('still processes the ticket when the AI agent has not been seeded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null)

    await processTicketInBackground(ticket)

    expect(prisma.ticket.updateMany).not.toHaveBeenCalledWith(assignedToAi(7))
    expect(autoResolveTicket).toHaveBeenCalled()
    expect(warn.mock.calls[0][0]).toContain('Ticket 7 was not assigned')
  })

  it('leaves the ticket resolved and with the AI agent when the AI answered it', async () => {
    vi.mocked(autoResolveTicket).mockResolvedValue(true)

    await processTicketInBackground(ticket)

    expect(autoResolveTicket).toHaveBeenCalledWith(ticket, 'general_question')
    expect(prisma.ticket.updateMany).toHaveBeenCalledTimes(2)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('opens and unassigns the ticket when the AI could not answer it', async () => {
    await processTicketInBackground(ticket)

    expect(prisma.ticket.updateMany).toHaveBeenCalledWith(moved(7, 'processing', 'open'))
    expect(prisma.ticket.updateMany).toHaveBeenLastCalledWith(unassigned(7))
    expect(prisma.$transaction).toHaveBeenCalledOnce()
  })

  it('opens and unassigns the ticket without answering when it could not be classified', async () => {
    vi.mocked(classifyTicketInBackground).mockResolvedValue(null)

    await processTicketInBackground(ticket)

    expect(autoResolveTicket).not.toHaveBeenCalled()
    expect(prisma.ticket.updateMany).toHaveBeenCalledWith(moved(7, 'processing', 'open'))
    expect(prisma.ticket.updateMany).toHaveBeenLastCalledWith(unassigned(7))
  })

  describe('with a default agent', () => {
    const toLucy = {
      where: { id: 7, OR: [{ assignedToId: 'jane-ai' }, { assignedToId: null }] },
      data: { assignedToId: 'lucy-id' },
    }
    const lookup = {
      where: { email: 'lucy@example.com', role: 'agent', deletedAt: null },
      select: { id: true },
    }

    beforeEach(() => {
      vi.stubEnv('DEFAULT_AGENT_EMAIL', ' Lucy@Example.com ')
    })

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('assigns the ticket to them when the AI could not answer it', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'lucy-id' } as never)

      await processTicketInBackground(ticket)

      expect(prisma.user.findFirst).toHaveBeenLastCalledWith(lookup)
      expect(prisma.ticket.updateMany).toHaveBeenCalledWith(moved(7, 'processing', 'open'))
      expect(prisma.ticket.updateMany).toHaveBeenLastCalledWith(toLucy)
      expect(prisma.$transaction).toHaveBeenCalledOnce()
    })

    it('assigns the ticket to them when it could not be classified', async () => {
      vi.mocked(classifyTicketInBackground).mockResolvedValue(null)
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'lucy-id' } as never)

      await processTicketInBackground(ticket)

      expect(prisma.ticket.updateMany).toHaveBeenLastCalledWith(toLucy)
    })

    it('leaves a ticket the AI answered with the AI', async () => {
      vi.mocked(autoResolveTicket).mockResolvedValue(true)

      await processTicketInBackground(ticket)

      expect(prisma.ticket.updateMany).not.toHaveBeenCalledWith(toLucy)
    })

    it('still opens the ticket, unassigned, when no active agent has that address', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(prisma.user.findFirst)
        .mockResolvedValueOnce({ id: 'jane-ai' } as never)
        .mockResolvedValueOnce(null)

      await processTicketInBackground(ticket)

      expect(prisma.ticket.updateMany).toHaveBeenCalledWith(moved(7, 'processing', 'open'))
      expect(prisma.ticket.updateMany).toHaveBeenLastCalledWith(unassigned(7))
      expect(warn).toHaveBeenCalledWith('DEFAULT_AGENT_EMAIL does not match an active agent')
    })
  })

  it('does nothing when the ticket has already left the new state', async () => {
    vi.mocked(prisma.ticket.updateMany).mockResolvedValue({ count: 0 } as never)

    await processTicketInBackground(ticket)

    expect(classifyTicketInBackground).not.toHaveBeenCalled()
  })

  it('logs and does not reject when the database fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(prisma.ticket.updateMany).mockRejectedValue(new Error('Database down'))

    await expect(processTicketInBackground(ticket)).resolves.toBeUndefined()

    expect(log).toHaveBeenCalledWith('Could not process ticket 7:', 'Database down')
  })
})

describe('sweepTickets', () => {
  it('looks for stuck, waiting and uncategorized tickets in the right time windows', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-02T12:00:00Z') })

    await sweepTickets()

    const wheres = vi.mocked(prisma.ticket.findMany).mock.calls.map(([args]) => args?.where)
    expect(wheres).toEqual([
      { status: 'processing', updatedAt: { lte: new Date('2026-11-02T11:50:00Z') } },
      { status: 'new', createdAt: { lte: new Date('2026-11-02T11:58:00Z') } },
      {
        status: 'open',
        category: null,
        createdAt: {
          gte: new Date('2026-11-01T12:00:00Z'),
          lte: new Date('2026-11-02T11:58:00Z'),
        },
      },
    ])
  })

  it('sends stuck tickets to an agent, without running the AI again', async () => {
    sweepFinds([{ id: 9 }], [], [])

    await sweepTickets()

    expect(prisma.ticket.updateMany).toHaveBeenCalledWith(moved(9, 'processing', 'open'))
    expect(prisma.ticket.updateMany).toHaveBeenCalledWith(unassigned(9))
    expect(classifyTicketInBackground).not.toHaveBeenCalled()
  })

  it('processes tickets still waiting as new', async () => {
    sweepFinds([], [ticket], [])

    await sweepTickets()

    expect(prisma.ticket.updateMany).toHaveBeenCalledWith(moved(7, 'new', 'processing'))
    expect(autoResolveTicket).toHaveBeenCalledWith(ticket, 'general_question')
  })

  it('only classifies open tickets, because agents can already see them', async () => {
    sweepFinds([], [], [ticket])

    await sweepTickets()

    expect(classifyTicketInBackground).toHaveBeenCalledWith(ticket)
    expect(autoResolveTicket).not.toHaveBeenCalled()
    expect(prisma.ticket.updateMany).not.toHaveBeenCalled()
  })

  it('still recovers stuck tickets when no API key is configured', async () => {
    vi.mocked(isOpenAIConfigured).mockReturnValue(false)
    sweepFinds([{ id: 9 }], [], [])

    await sweepTickets()

    expect(prisma.ticket.updateMany).toHaveBeenCalledWith(moved(9, 'processing', 'open'))
    expect(prisma.ticket.findMany).toHaveBeenCalledTimes(2)
  })

  it('logs and does not reject when the database query fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(prisma.ticket.findMany).mockRejectedValue(new Error('Database down'))

    await expect(sweepTickets()).resolves.toBeUndefined()

    expect(log).toHaveBeenCalledWith('Could not sweep tickets:', 'Database down')
  })
})

describe('startTicketSweep', () => {
  it('sweeps straight away and then every 10 minutes', async () => {
    vi.useFakeTimers()

    startTicketSweep()
    await vi.advanceTimersByTimeAsync(0)
    expect(prisma.ticket.findMany).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(prisma.ticket.findMany).toHaveBeenCalledTimes(6)
  })

  it('keeps sweeping after a sweep fails', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(prisma.ticket.findMany).mockRejectedValueOnce(new Error('Database down'))

    startTicketSweep()
    await vi.advanceTimersByTimeAsync(10 * 60_000)

    expect(prisma.ticket.findMany).toHaveBeenCalledTimes(4)
  })

  it('does not start the next sweep until the last one has finished', async () => {
    vi.useFakeTimers()
    vi.mocked(prisma.ticket.findMany).mockReturnValueOnce(new Promise(() => {}) as never)

    startTicketSweep()
    await vi.advanceTimersByTimeAsync(30 * 60_000)

    expect(prisma.ticket.findMany).toHaveBeenCalledTimes(1)
  })
})
