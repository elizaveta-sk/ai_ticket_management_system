import { describe, expect, it } from 'vitest'
import {
  assignTicketSchema,
  inboundEmailSchema,
  ticketIdSchema,
  ticketQuerySchema,
} from './tickets.ts'

describe('assignTicketSchema', () => {
  it('accepts a user id', () => {
    expect(assignTicketSchema.parse({ assignedToId: 'abc' })).toEqual({ assignedToId: 'abc' })
  })

  it('accepts null, which removes the assignee', () => {
    expect(assignTicketSchema.parse({ assignedToId: null })).toEqual({ assignedToId: null })
  })

  it.each([
    ['a missing assignee', {}],
    ['a blank assignee', { assignedToId: '' }],
    ['a NUL character', { assignedToId: 'a\0b' }],
    ['a number', { assignedToId: 1 }],
    ['an array', { assignedToId: ['abc'] }],
    ['other fields', { assignedToId: 'abc', status: 'closed' }],
    ['no body', undefined],
  ])('rejects %s', (_label, input) => {
    expect(assignTicketSchema.safeParse(input).success).toBe(false)
  })
})

describe('ticketIdSchema', () => {
  it('reads a number from URL text', () => {
    expect(ticketIdSchema.parse('42')).toBe(42)
  })

  it('accepts the largest id the database can hold and rejects the next', () => {
    expect(ticketIdSchema.parse('2147483647')).toBe(2147483647)
    expect(ticketIdSchema.safeParse('2147483648').success).toBe(false)
  })

  it.each(['0', '-1', '1.5', '1e3', '0x10', '007', 'abc', '', ' 1', '9'.repeat(400)])(
    'rejects "%s"',
    (id) => {
      expect(ticketIdSchema.safeParse(id).success).toBe(false)
    },
  )
})

describe('ticketQuerySchema', () => {
  it('defaults to newest first', () => {
    expect(ticketQuerySchema.parse({})).toMatchObject({ sortBy: 'createdAt', sortOrder: 'desc' })
  })

  it.each(['subject', 'senderName', 'status', 'category', 'createdAt'])('accepts %s', (sortBy) => {
    expect(ticketQuerySchema.parse({ sortBy, sortOrder: 'asc' })).toMatchObject({
      sortBy,
      sortOrder: 'asc',
    })
  })

  it.each([
    ['a column that cannot be sorted', { sortBy: 'body' }],
    ['a blank column', { sortBy: '' }],
    ['a repeated column', { sortBy: ['subject', 'status'] }],
    ['an unknown order', { sortOrder: 'sideways' }],
    ['an unknown status', { status: 'pending' }],
    ['a blank status', { status: '' }],
    ['a repeated status', { status: ['open', 'closed'] }],
    ['an unknown category', { category: 'billing' }],
    ['a blank category', { category: '' }],
    ['a mistyped filter', { statuss: 'open' }],
    ['a filter written as an array', { 'status[]': 'open' }],
  ])('rejects %s', (_label, input) => {
    expect(ticketQuerySchema.safeParse(input).success).toBe(false)
  })

  it.each(['open', 'resolved', 'closed'])('accepts the %s status', (status) => {
    expect(ticketQuerySchema.parse({ status }).status).toBe(status)
  })

  it.each(['general_question', 'technical_question', 'refund_request', 'uncategorized'])(
    'accepts the %s category',
    (category) => {
      expect(ticketQuerySchema.parse({ category }).category).toBe(category)
    },
  )

  describe('page and pageSize', () => {
    it('defaults to the first page of 20', () => {
      expect(ticketQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 20 })
    })

    it('reads numbers from query string text', () => {
      expect(ticketQuerySchema.parse({ page: '3', pageSize: '50' })).toMatchObject({
        page: 3,
        pageSize: 50,
      })
    })

    it.each([
      ['zero', { page: '0' }],
      ['negative', { page: '-1' }],
      ['a fraction', { page: '1.5' }],
      ['text', { page: 'two' }],
      ['blank', { page: '' }],
      ['repeated', { page: ['1', '2'] }],
      ['too large', { page: '1000001' }],
      ['infinite', { page: 'Infinity' }],
    ])('rejects a page that is %s', (_label, input) => {
      expect(ticketQuerySchema.safeParse(input).success).toBe(false)
    })

    it.each(['0', '-5', '101', '2.5', 'many', ''])('rejects a pageSize of "%s"', (pageSize) => {
      expect(ticketQuerySchema.safeParse({ pageSize }).success).toBe(false)
    })
  })

  describe('search', () => {
    it('is optional', () => {
      expect(ticketQuerySchema.parse({}).search).toBeUndefined()
    })

    it('trims surrounding whitespace and removes NUL characters', () => {
      expect(ticketQuerySchema.parse({ search: '  ref\0und  ' }).search).toBe('refund')
    })

    it('treats whitespace as an empty search', () => {
      expect(ticketQuerySchema.parse({ search: '   ' }).search).toBe('')
    })

    it('accepts 200 characters and rejects 201', () => {
      expect(ticketQuerySchema.safeParse({ search: 'a'.repeat(200) }).success).toBe(true)
      expect(ticketQuerySchema.safeParse({ search: 'a'.repeat(201) }).success).toBe(false)
    })

    it('rejects a repeated search', () => {
      expect(ticketQuerySchema.safeParse({ search: ['a', 'b'] }).success).toBe(false)
    })
  })
})

const validEmail = {
  messageId: '<abc@mail.example.com>',
  from: 'student@example.com',
  fromName: 'Test Student',
  subject: 'Help with my course',
  text: 'I cannot access the course materials.',
}

function without(field: keyof typeof validEmail) {
  const { [field]: _omit, ...rest } = validEmail
  return rest
}

function firstError(input: unknown) {
  const result = inboundEmailSchema.safeParse(input)
  return result.success ? undefined : result.error.issues[0].message
}

describe('inboundEmailSchema', () => {
  it('accepts a valid email and keeps its values', () => {
    expect(inboundEmailSchema.parse(validEmail)).toEqual(validEmail)
  })

  describe('messageId', () => {
    it.each([
      ['missing', without('messageId')],
      ['blank', { ...validEmail, messageId: '   ' }],
    ])('rejects a %s messageId', (_label, input) => {
      expect(firstError(input)).toBeDefined()
    })

    it('accepts 512 characters and rejects 513', () => {
      const ofLength = (length: number) => ({ ...validEmail, messageId: 'a'.repeat(length) })

      expect(firstError(ofLength(512))).toBeUndefined()
      expect(firstError(ofLength(513))).toBe('messageId is too long')
    })

    it('trims surrounding whitespace', () => {
      const { messageId } = inboundEmailSchema.parse({ ...validEmail, messageId: '  <a@b.c>  ' })

      expect(messageId).toBe('<a@b.c>')
    })
  })

  describe('from', () => {
    it.each([
      ['missing', without('from')],
      ['invalid', { ...validEmail, from: 'not-an-email' }],
    ])('rejects a %s from address', (_label, input) => {
      expect(firstError(input)).toBeDefined()
    })

    it('lowercases the address', () => {
      const { from } = inboundEmailSchema.parse({ ...validEmail, from: 'Student@Example.COM' })

      expect(from).toBe('student@example.com')
    })
  })

  describe('fromName', () => {
    it.each([
      ['missing', without('fromName')],
      ['empty', { ...validEmail, fromName: '' }],
      ['whitespace only', { ...validEmail, fromName: '   \t  ' }],
      ['only NUL characters', { ...validEmail, fromName: '\0\0\0' }],
      ['NUL characters and whitespace', { ...validEmail, fromName: ' \0 \0 ' }],
    ])('rejects a fromName that is %s', (_label, input) => {
      expect(firstError(input)).toBe('fromName is required')
    })

    it('trims surrounding whitespace', () => {
      const { fromName } = inboundEmailSchema.parse({ ...validEmail, fromName: '  Test Student  ' })

      expect(fromName).toBe('Test Student')
    })
  })

  describe('subject and text', () => {
    it('accepts an email with neither, using a placeholder subject and an empty body', () => {
      const { subject, text, ...rest } = validEmail
      const parsed = inboundEmailSchema.parse(rest)

      expect(parsed.subject).toBe('(no subject)')
      expect(parsed.text).toBe('')
    })

    it.each([
      ['blank', '   '],
      ['only NUL characters', '\0\0'],
    ])('uses the placeholder for a subject that is %s', (_label, subject) => {
      expect(inboundEmailSchema.parse({ ...validEmail, subject }).subject).toBe('(no subject)')
    })
  })

  it('removes NUL characters, which PostgreSQL text columns cannot store', () => {
    const parsed = inboundEmailSchema.parse({
      ...validEmail,
      fromName: 'Stu\0dent',
      subject: 'Hel\0lo',
      text: 'Body\0with\0nulls',
    })

    expect(parsed.fromName).toBe('Student')
    expect(parsed.subject).toBe('Hello')
    expect(parsed.text).toBe('Bodywithnulls')
  })
})
