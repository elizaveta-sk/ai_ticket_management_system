import { describe, expect, it } from 'vitest'
import { formatPolishedReply } from './polished-reply.ts'

const names = { customerName: 'Grace Student', agentName: 'Ada Agent' }

function format(message: string, greeting = 'Hi', signOff = 'Best regards') {
  return formatPolishedReply({ greeting, message, signOff }, names)
}

const reply = (message: string) => `Hi Grace,\n\n${message}\n\nBest regards,\nAda Agent`

describe('formatPolishedReply', () => {
  it('addresses the customer by first name and signs with the full agent name', () => {
    expect(format('Your refund has been issued.')).toBe(reply('Your refund has been issued.'))
  })

  it('uses the greeting and sign-off in the language the model chose', () => {
    expect(format('El curso empieza el lunes.', 'Hola', 'Saludos')).toBe(
      'Hola Grace,\n\nEl curso empieza el lunes.\n\nSaludos,\nAda Agent',
    )
  })

  it('removes punctuation the model adds to the greeting and sign-off', () => {
    expect(format('Done.', 'Hi,', 'Best regards,')).toBe(reply('Done.'))
  })

  it('keeps names on one line', () => {
    expect(
      formatPolishedReply(
        { greeting: 'Hi', message: 'Done.', signOff: 'Best regards' },
        { customerName: ' Grace\nStudent ', agentName: 'Ada\n  Agent' },
      ),
    ).toBe(reply('Done.'))
  })

  it('does not double the comma after a name written with one', () => {
    expect(
      formatPolishedReply(
        { greeting: 'Hi', message: 'Done.', signOff: 'Thanks' },
        { customerName: 'Smith, John', agentName: 'Ada Agent' },
      ),
    ).toBe('Hi Smith,\n\nDone.\n\nThanks,\nAda Agent')
  })

  it('leaves special characters in a name as they are', () => {
    expect(
      formatPolishedReply(
        { greeting: 'Hi', message: 'Done.', signOff: 'Thanks' },
        { customerName: '$& [AGENT_NAME]', agentName: 'A(da' },
      ),
    ).toBe('Hi $&,\n\nDone.\n\nThanks,\nA(da')
  })

  it.each([
    ['a hyphen', 'Mary-Jane Lee', 'Jo-Ann Fox', 'Mary-Jane'],
    ['an apostrophe', "D'Arcy O'Brien", "Sinéad O'Neill", "D'Arcy"],
    ['a full stop', 'J. Smith', 'A. Lee', 'J.'],
    ['brackets and a slash', 'Grace (she/her)', 'Ada [Support]', 'Grace'],
    ['letters beyond English', 'Łucja Nowak', 'José Núñez', 'Łucja'],
    ['a single name', 'Madonna', 'Cher', 'Madonna'],
  ])('handles names with %s, removing them from the message', (_label, customerName, agentName, first) => {
    const parts = {
      greeting: 'Hi',
      message: `Hi ${customerName},\n\nDone.\n\nThanks,\n${agentName}`,
      signOff: 'Best regards',
    }

    expect(formatPolishedReply(parts, { customerName, agentName })).toBe(
      `Hi ${first},\n\nDone.\n\nBest regards,\n${agentName}`,
    )
  })

  describe('a greeting left in the message', () => {
    it.each([
      ['a different greeting word', "Hello, I've fixed it.", "I've fixed it."],
      ['the same greeting word', 'Hi, I fixed it.', 'I fixed it.'],
      ['a first name', 'Hi Grace, your refund is done.', 'Your refund is done.'],
      ['a full name', 'Hello Grace Student,\n\nDone.', 'Done.'],
      ['another name', 'Hey Gracie! Done.', 'Done.'],
      ['"there"', 'Hi there, done.', 'Done.'],
      ['a greeting on its own line', 'Hello\nDone.', 'Done.'],
      ['a greeting phrase', 'Good morning, done.', 'Done.'],
    ])('removes %s', (_label, message, expected) => {
      expect(format(message)).toBe(reply(expected))
    })

    it('removes a repeated greeting in another language', () => {
      expect(format('Hola Grace,\n\nEl curso empieza.', 'Hola', 'Saludos')).toBe(
        'Hola Grace,\n\nEl curso empieza.\n\nSaludos,\nAda Agent',
      )
    })

    it.each(['Merhaba Grace,\n\nDone.', 'Merhaba,\n\nDone.'])(
      'removes the greeting paragraph in %j, in a language it has no words for',
      (message) => {
        expect(format(message)).toBe(reply('Done.'))
      },
    )

    it('starts the message with a capital once the greeting is gone', () => {
      expect(format('hello, your refund is done.')).toBe(reply('Your refund is done.'))
    })

    it('keeps every line after a greeting on its own line', () => {
      expect(format('Hello\nFirst line.\nSecond line.')).toBe(reply('First line.\nSecond line.'))
    })

    it.each([
      'Hi-res images are attached.',
      'Hello Kitty items are out of stock.',
      'Highlights are on the course page.',
      'Good morning classes start on Monday.',
      'Thanks Grace, your refund is done.',
      'Hi done.',
      'Good news,\n\nYour refund is done.',
      'Please note the following,\n\nYour refund is done.',
    ])('keeps %j, which only looks like a greeting', (message) => {
      expect(format(message)).toBe(reply(message))
    })
  })

  describe('a sign-off left in the message', () => {
    it.each([
      ['a phrase and first name', 'Please send your ID. Thanks, Ada', 'Please send your ID.'],
      ['after a question', 'Could you send your ID? Thanks, Ada.', 'Could you send your ID?'],
      ['on its own paragraph', 'Done.\n\nBest regards,\nAda Agent', 'Done.'],
      ['in another language', 'Done.\n\nAtentamente,\nAda Agent', 'Done.'],
      ['the same words with no name', 'Done.\n\nBest regards,', 'Done.'],
    ])('removes %s', (_label, message, expected) => {
      expect(format(message)).toBe(reply(expected))
    })

    it.each(['Please contact Ada.', 'Your tutor will reply soon. Thank you.'])(
      'keeps %j, which is not a sign-off',
      (message) => {
        expect(format(message)).toBe(reply(message))
      },
    )
  })

  it('gives the same reply when an already polished reply comes back whole', () => {
    expect(format(reply('Your refund has been issued.'))).toBe(
      reply('Your refund has been issued.'),
    )
  })

  it.each([
    ['message', { greeting: 'Hi', message: '  ', signOff: 'Thanks' }],
    ['greeting', { greeting: ' , ', message: 'Done.', signOff: 'Thanks' }],
    ['sign-off', { greeting: 'Hi', message: 'Done.', signOff: '' }],
    ['message once its greeting is removed', { greeting: 'Hi', message: 'Hi Grace,', signOff: 'Thanks' }],
  ])('returns null for an empty %s', (_label, parts) => {
    expect(formatPolishedReply(parts, names)).toBeNull()
  })
})
