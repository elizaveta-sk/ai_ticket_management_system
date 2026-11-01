import { generateText } from 'ai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { summarizeTicket } from './summarize-ticket.ts'

vi.mock('ai', () => ({ generateText: vi.fn() }))

const ticket = {
  subject: 'Refund',
  body: 'Please refund me.',
  replies: [{ senderType: 'agent' as const, body: 'Looking into it.' }],
}

function modelReturns(text: string, finishReason = 'stop') {
  vi.mocked(generateText).mockResolvedValue({ text, finishReason } as never)
}

afterEach(() => {
  vi.mocked(generateText).mockReset()
})

describe('summarizeTicket', () => {
  it('returns the trimmed summary', async () => {
    modelReturns('  The student wants a refund.\n')

    await expect(summarizeTicket(ticket)).resolves.toBe('The student wants a refund.')
  })

  it('sends the whole thread to gpt-5-nano, without storing it', async () => {
    modelReturns('Summary.')

    await summarizeTicket(ticket)

    const options = vi.mocked(generateText).mock.calls[0][0]
    expect((options.model as { modelId: string }).modelId).toBe('gpt-5-nano')
    expect(options.prompt).toContain('Please refund me.')
    expect(options.prompt).toContain('Looking into it.')
    expect(options.providerOptions?.openai?.store).toBe(false)
  })

  it('returns null when the model stops early', async () => {
    modelReturns('The student wants', 'length')

    await expect(summarizeTicket(ticket)).resolves.toBeNull()
  })

  it('returns null when the model returns nothing', async () => {
    modelReturns('  ')

    await expect(summarizeTicket(ticket)).resolves.toBeNull()
  })

  it('lets a model failure reach the caller', async () => {
    vi.mocked(generateText).mockRejectedValue(new Error('Model failed'))

    await expect(summarizeTicket(ticket)).rejects.toThrow('Model failed')
  })
})
