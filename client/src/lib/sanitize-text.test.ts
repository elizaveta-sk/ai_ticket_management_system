import { describe, expect, it } from 'vitest'
import { sanitizeText } from './sanitize-text.ts'

describe('sanitizeText', () => {
  it.each([
    ['an image with a script handler', '<img src=x onerror=alert(1)> hello', ' hello'],
    ['a script and its content', '<script>alert(1)</script>hi', 'hi'],
    ['formatting tags, keeping their text', '<b>bold</b>', 'bold'],
  ])('removes %s', (_label, input, output) => {
    expect(sanitizeText(input)).toBe(output)
  })

  it.each([
    ['an ampersand', 'Tom & Jerry'],
    ['a spaced less-than sign', 'a < b'],
    ['line breaks and indentation', 'Line one\n\n  Line two\n'],
  ])('keeps %s unchanged', (_label, input) => {
    expect(sanitizeText(input)).toBe(input)
  })
})
