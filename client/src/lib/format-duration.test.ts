import { describe, expect, it } from 'vitest'
import { formatDuration } from './format-duration.ts'

describe('formatDuration', () => {
  it.each([
    [0, '0s'],
    [4.4, '4s'],
    [59, '59s'],
    [60, '1m'],
    [150, '2m'],
    [3_600, '1h'],
    [3_660, '1h 1m'],
    [86_400, '1d'],
    [93_600, '1d 2h'],
  ])('shows %d seconds as %s', (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text)
  })
})
