import { describe, expect, it } from 'vitest'
import { customerReplyBody, emailAddressIn, isAutomaticEmail, removeQuotedText } from './email-reply.ts'

describe('emailAddressIn', () => {
  it.each([
    ['Grace Student <Grace@Test.dev>', 'grace@test.dev'],
    ['  grace@test.dev ', 'grace@test.dev'],
    ['"Student, Grace" <grace@test.dev>', 'grace@test.dev'],
  ])('reads %j', (value, address) => {
    expect(emailAddressIn(value)).toBe(address)
  })
})

describe('isAutomaticEmail', () => {
  it.each([
    'Auto-Submitted: auto-replied',
    'auto-submitted: auto-generated',
    'Precedence: bulk',
    'X-Autoreply: yes',
    'Subject: Hi\nX-Autorespond: yes',
  ])('recognizes %j', (headers) => {
    expect(isAutomaticEmail(headers)).toBe(true)
  })

  it.each(['Auto-Submitted: no', 'From: grace@test.dev\nSubject: Auto-Submitted: hello', ''])(
    'leaves %j alone',
    (headers) => {
      expect(isAutomaticEmail(headers)).toBe(false)
    },
  )
})

describe('removeQuotedText', () => {
  it.each([
    ['Gmail', 'Thanks!\n\nOn Mon, Nov 2, 2026 at 2:02 PM Jane <a@b.dev> wrote:\n> Hello\n> There'],
    ['a wrapped Gmail heading', 'Thanks!\n\nOn Mon, Nov 2, 2026 at 2:02 PM Jane\n<a@b.dev> wrote:\n> Hello'],
    ['Outlook', 'Thanks!\r\n\r\nFrom: Jane <a@b.dev>\r\nSent: Monday\r\nTo: Grace\r\n\r\nHello'],
    ['an original message line', 'Thanks!\n\n-----Original Message-----\nHello'],
    ['a divider', 'Thanks!\n\n________________________________\nHello'],
    ['only trailing quoted lines', 'Thanks!\n\n> Hello\n> There\n'],
  ])('removes the quote from %s', (_client, text) => {
    expect(removeQuotedText(text)).toBe('Thanks!')
  })

  it('keeps a reply written between the quoted lines', () => {
    expect(removeQuotedText('> Which course?\nThe video one.\n> Which device?\nA tablet.')).toBe(
      '> Which course?\nThe video one.\n> Which device?\nA tablet.',
    )
  })

  it('keeps the whole message when all of it looks quoted', () => {
    expect(removeQuotedText('> Only this')).toBe('> Only this')
  })

  it('keeps a line that merely mentions someone writing', () => {
    expect(removeQuotedText('On your site I wrote: hello\nThanks')).toBe(
      'On your site I wrote: hello\nThanks',
    )
  })
})

describe('customerReplyBody', () => {
  it('uses the text and removes the quote', () => {
    expect(
      customerReplyBody({ text: 'Thanks!\n> Hello', html: '<p>ignored</p>', attachments: 0 }),
    ).toBe('Thanks!')
  })

  it('falls back to the HTML, as plain text', () => {
    expect(
      customerReplyBody({
        text: ' ',
        html: '<style>p{}</style><p>First</p><script>x()</script><b>Second</b>',
        attachments: 0,
      }),
    ).toBe('First\n Second')
  })

  it('says so when there is no text', () => {
    expect(customerReplyBody({ text: '', html: '', attachments: 0 })).toBe('(This email had no text.)')
  })

  it('notes attachments, which are not saved', () => {
    expect(customerReplyBody({ text: 'See this', html: '', attachments: 1 })).toBe(
      'See this\n\n(This email had 1 attachment, which was not saved.)',
    )
    expect(customerReplyBody({ text: 'See these', html: '', attachments: 2 })).toBe(
      'See these\n\n(This email had 2 attachments, which were not saved.)',
    )
  })

  it('removes NUL characters and stays within the reply limit', () => {
    const body = customerReplyBody({ text: `a\0${'b'.repeat(30_000)}`, html: '', attachments: 1 })

    expect(body).not.toContain('\0')
    expect(body).toHaveLength(20_000)
    expect(body.endsWith('not saved.)')).toBe(true)
  })
})
