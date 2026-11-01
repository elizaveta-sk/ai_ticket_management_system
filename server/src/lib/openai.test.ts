import { afterEach, describe, expect, it, vi } from 'vitest'
import { isOpenAIConfigured } from './openai.ts'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isOpenAIConfigured', () => {
  it.each([
    ['missing', '', false],
    ['the placeholder from .env.example', 'YOUR_OPENAI_API_KEY', false],
    ['a real key', 'sk-test', true],
  ])('with a key that is %s', (_label, key, expected) => {
    vi.stubEnv('OPENAI_API_KEY', key)

    expect(isOpenAIConfigured()).toBe(expected)
  })
})
