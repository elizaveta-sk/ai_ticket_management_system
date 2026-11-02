import { generateText } from 'ai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { answerFromKnowledgeBase, autoResolveTicket } from './auto-resolve-ticket.ts'
import { isEmailConfigured, missingEmailSettings, sendEmail } from './email.ts'
import { isOpenAIConfigured } from './openai.ts'
import { prisma } from './prisma.ts'

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: vi.fn(),
}))
vi.mock('./email.ts', () => ({
  isEmailConfigured: vi.fn(),
  missingEmailSettings: vi.fn(),
  sendEmail: vi.fn(),
}))
vi.mock('./openai.ts', () => ({ isOpenAIConfigured: vi.fn() }))
vi.mock('./prisma.ts', () => ({
  prisma: {
    $transaction: vi.fn(),
    ticket: { findFirst: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
    ticketReply: { create: vi.fn() },
  },
}))

const ticket = { id: 7, subject: 'Videos', body: 'Can I download videos?' }
const answer = 'Videos are streamed online, and offline downloads are not supported.'

function modelReturns(output: { canAnswer: boolean; answer: string }) {
  vi.mocked(generateText).mockResolvedValue({ output } as never)
}

beforeEach(() => {
  vi.mocked(isOpenAIConfigured).mockReturnValue(true)
  vi.mocked(isEmailConfigured).mockReturnValue(true)
  vi.mocked(missingEmailSettings).mockReturnValue([])
  modelReturns({ canAnswer: true, answer })
  vi.mocked(prisma.ticket.findFirst).mockResolvedValue({
    senderEmail: 'grace@test.dev',
    senderName: 'Grace Student',
  } as never)
  // The first count is the sender's recent answers, and the second finds the untouched ticket.
  vi.mocked(prisma.ticket.count).mockResolvedValueOnce(0).mockResolvedValueOnce(1)
  vi.mocked(prisma.$transaction).mockResolvedValue([] as never)
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const mock of [
    generateText,
    sendEmail,
    prisma.$transaction,
    prisma.ticket.findFirst,
    prisma.ticket.count,
    prisma.ticket.updateMany,
    prisma.ticketReply.create,
  ]) {
    vi.mocked(mock).mockReset()
  }
})

describe('answerFromKnowledgeBase', () => {
  it('sends the knowledge base and the email, and returns the answer', async () => {
    await expect(answerFromKnowledgeBase(ticket)).resolves.toBe(answer)

    const options = vi.mocked(generateText).mock.calls[0][0]
    expect((options.model as { modelId: string }).modelId).toBe('gpt-5-nano')
    expect(options.providerOptions?.openai?.store).toBe(false)
    expect(options.system).toContain('30-day money-back guarantee')
    expect(JSON.parse(options.prompt as string)).toEqual({
      subject: 'Videos',
      body: 'Can I download videos?',
    })
  })

  it('returns null when the model cannot answer', async () => {
    modelReturns({ canAnswer: false, answer: '' })

    await expect(answerFromKnowledgeBase(ticket)).resolves.toBeNull()
  })

  it('returns null when the answer contains a link', async () => {
    modelReturns({ canAnswer: true, answer: 'Claim your prize at evil.com.' })

    await expect(answerFromKnowledgeBase(ticket)).resolves.toBeNull()
  })
})

describe('autoResolveTicket', () => {
  it('emails the answer, then resolves the ticket and saves the reply', async () => {
    await expect(autoResolveTicket(ticket, 'general_question')).resolves.toBe(true)

    expect(sendEmail).toHaveBeenCalledWith({
      to: 'grace@test.dev',
      subject: 'Your support request',
      text: expect.stringMatching(/^Hi Grace,\n\n.*\n\nBest,\nJane\nSupport team$/s),
      automated: true,
    })
    expect(prisma.ticket.updateMany).toHaveBeenCalledWith({
      where: { id: 7, status: 'processing' },
      data: { status: 'resolved', resolvedByAi: true, resolvedAt: expect.any(Date) },
    })
    expect(prisma.ticketReply.create).toHaveBeenCalledWith({
      data: { ticketId: 7, senderType: 'ai', body: expect.stringContaining(answer) },
    })
    expect(vi.mocked(sendEmail).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(prisma.$transaction).mock.invocationCallOrder[0],
    )
  })

  it.each([
    ['there is no OpenAI key', () => vi.mocked(isOpenAIConfigured).mockReturnValue(false)],
    ['email is not configured', () => vi.mocked(isEmailConfigured).mockReturnValue(false)],
  ])('does nothing when %s', async (_name, arrange) => {
    arrange()

    await autoResolveTicket(ticket, 'general_question')

    expect(generateText).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('leaves refund requests to a person, without asking the model', async () => {
    await autoResolveTicket(ticket, 'refund_request')

    expect(generateText).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('leaves the ticket alone when someone is already handling it', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(null)

    await autoResolveTicket(ticket, 'general_question')

    expect(generateText).not.toHaveBeenCalled()
  })

  it('stops answering an address that has already had 3 automatic answers', async () => {
    vi.mocked(prisma.ticket.count).mockReset().mockResolvedValue(3)

    await autoResolveTicket(ticket, 'general_question')

    expect(generateText).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('logs why a ticket went to an agent, without any of the email', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    modelReturns({ canAnswer: false, answer: '' })

    await autoResolveTicket(ticket, 'general_question')

    expect(log).toHaveBeenCalledWith(
      'Ticket 7 left for an agent: the model could not give a safe, complete answer',
    )
  })

  it('logs which settings are missing when auto-resolve is off', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.mocked(isOpenAIConfigured).mockReturnValue(false)
    vi.mocked(isEmailConfigured).mockReturnValue(false)
    vi.mocked(missingEmailSettings).mockReturnValue(['EMAIL_FROM'])

    await autoResolveTicket(ticket, 'general_question')

    expect(log.mock.calls[0][0]).toBe(
      'Ticket 7 left for an agent: auto-resolve is off, because the server is missing OPENAI_API_KEY, EMAIL_FROM',
    )
  })

  it('only looks at a ticket in processing that nobody has touched', async () => {
    await autoResolveTicket(ticket, 'general_question')

    expect(vi.mocked(prisma.ticket.findFirst).mock.calls[0][0]?.where).toEqual({
      id: 7,
      status: 'processing',
      assignedToId: null,
      replies: { none: {} },
    })
  })

  it('reports false and sends nothing when the model cannot answer', async () => {
    modelReturns({ canAnswer: false, answer: '' })

    await expect(autoResolveTicket(ticket, 'general_question')).resolves.toBe(false)

    expect(sendEmail).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('sends nothing when an agent picks the ticket up during the model call', async () => {
    vi.mocked(prisma.ticket.count).mockReset().mockResolvedValueOnce(0).mockResolvedValueOnce(0)

    await autoResolveTicket(ticket, 'general_question')

    expect(sendEmail).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('reports false and logs only the message when the email fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(sendEmail).mockRejectedValue(new Error('Forbidden'))

    await expect(autoResolveTicket(ticket, 'general_question')).resolves.toBe(false)

    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('Could not auto-resolve ticket 7:', 'Forbidden')
  })
})
