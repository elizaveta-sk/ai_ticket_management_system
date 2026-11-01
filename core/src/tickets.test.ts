import { describe, expect, it } from 'vitest'
import { inboundEmailSchema } from './tickets.ts'

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
