import { describe, expect, it } from 'vitest'
import { formatAge, isOverdue } from './format-age.ts'

const now = new Date('2026-03-10T12:00:00.000Z').getTime()
const ago = (ms: number) => new Date(now - ms).toISOString()
const minute = 60_000
const hour = 60 * minute
const day = 24 * hour

describe('formatAge', () => {
  it.each([
    [30_000, 'Just now'],
    [minute, '1 min ago'],
    [59 * minute, '59 min ago'],
    [hour, '1 hr ago'],
    [23 * hour, '23 hr ago'],
    [day, '1 d ago'],
    [12 * day, '12 d ago'],
  ])('shows %i ms as %s', (ms, expected) => {
    expect(formatAge(ago(ms), now)).toBe(expected)
  })
})

describe('isOverdue', () => {
  it('starts at one day', () => {
    expect(isOverdue(ago(day - 1), now)).toBe(false)
    expect(isOverdue(ago(day), now)).toBe(true)
  })
})
