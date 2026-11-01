import { describe, expect, it } from 'vitest'
import { classificationRefetchInterval } from './classification-refetch.ts'

const secondsAgo = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString()

describe('classificationRefetchInterval', () => {
  it('refetches while a new ticket has no category', () => {
    expect(
      classificationRefetchInterval([
        { category: 'refund_request', createdAt: secondsAgo(5) },
        { category: null, createdAt: secondsAgo(5) },
      ]),
    ).toBe(2_000)
  })

  it('stops once every ticket has a category', () => {
    expect(
      classificationRefetchInterval([{ category: 'refund_request', createdAt: secondsAgo(5) }]),
    ).toBe(false)
  })

  it('does not refetch for an old ticket with no category', () => {
    expect(classificationRefetchInterval([{ category: null, createdAt: secondsAgo(121) }])).toBe(
      false,
    )
  })

  it('does not refetch before there are any tickets', () => {
    expect(classificationRefetchInterval(undefined)).toBe(false)
    expect(classificationRefetchInterval([])).toBe(false)
  })
})
