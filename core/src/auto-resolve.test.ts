import { describe, expect, it } from 'vitest'
import { autoAnswerMaxLength, formatAutoReply, isSafeAutoAnswer } from './auto-resolve.ts'

describe('isSafeAutoAnswer', () => {
  it('accepts a plain answer', () => {
    expect(isSafeAutoAnswer('Click Forgot Password on the login page.')).toBe(true)
  })

  it.each(['', '   ', 'x'.repeat(autoAnswerMaxLength + 1)])('rejects %j', (answer) => {
    expect(isSafeAutoAnswer(answer)).toBe(false)
  })

  it.each([
    'Visit https://evil.test/win now.',
    'Visit www.evil.test now.',
    'Visit evil.com for your prize.',
    'Write to someone@evil.org.',
  ])('rejects an answer with a link: %s', (answer) => {
    expect(isSafeAutoAnswer(answer)).toBe(false)
  })
})

describe('formatAutoReply', () => {
  it('greets by first name, invites further questions and signs off as Jane', () => {
    expect(formatAutoReply('  Videos are streamed online.  ', 'Grace Student')).toBe(
      'Hi Grace,\n\nVideos are streamed online.\n\nIf you have further questions, reply to this email.\n\nBest,\nJane\nSupport team',
    )
  })

  it.each([
    ['Mary-Jane O’Neil', 'Hi Mary-Jane,'],
    ['  José   García', 'Hi José,'],
    ['Smith, John', 'Hi Smith,'],
  ])('uses the first name of %s', (name, greeting) => {
    expect(formatAutoReply('Answer.', name).startsWith(`${greeting}\n\n`)).toBe(true)
  })

  it.each(['evil.com', 'grace@test.dev', 'https://evil.test', '50% off!', '   ', 'x'.repeat(41)])(
    'does not repeat a name that is not name-like: %j',
    (name) => {
      expect(formatAutoReply('Answer.', name).startsWith('Hi there,\n\n')).toBe(true)
    },
  )

  it('removes a greeting and sign-off the model added anyway', () => {
    const reply = formatAutoReply('Hi Grace,\n\nVideos are streamed.\n\nBest,\nJane', 'Grace Student')

    expect(reply.match(/Hi Grace/g)).toHaveLength(1)
    expect(reply.match(/Best,/g)).toHaveLength(1)
    expect(reply).toContain('Hi Grace,\n\nVideos are streamed.\n\nIf you have')
  })
})
