import { afterEach, describe, expect, it, vi } from 'vitest'
import { isEmailConfigured, missingEmailSettings } from './email.ts'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('missingEmailSettings', () => {
  it.each([
    ['SG.key', 'support@test.dev', []],
    ['', 'support@test.dev', ['SENDGRID_API_KEY']],
    ['SG.key', '', ['EMAIL_FROM']],
    ['YOUR_SENDGRID_API_KEY', 'YOUR_SUPPORT_ADDRESS', ['SENDGRID_API_KEY', 'EMAIL_FROM']],
  ])('with key %j and sender %j, reports %j', (key, from, missing) => {
    vi.stubEnv('SENDGRID_API_KEY', key)
    vi.stubEnv('EMAIL_FROM', from)

    expect(missingEmailSettings()).toEqual(missing)
    expect(isEmailConfigured()).toBe(missing.length === 0)
  })
})
