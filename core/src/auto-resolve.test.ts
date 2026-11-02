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
  it('says the answer is automated and how to reach a person', () => {
    const reply = formatAutoReply('  Videos are streamed online.  ')

    expect(reply).toContain('Hello,\n\nVideos are streamed online.\n\n')
    expect(reply).toContain('reply to this email and a member of our team will help you')
  })
})
