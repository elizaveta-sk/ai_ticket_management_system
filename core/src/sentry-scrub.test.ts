import { describe, expect, it } from 'vitest'
import { scrubSentryEvent, scrubSentrySpan } from './sentry-scrub.ts'

describe('scrubSentrySpan', () => {
  it('removes request bodies, headers and IP addresses but keeps other attributes', () => {
    const span = scrubSentrySpan({
      name: 'POST /api/contact',
      attributes: {
        'http.request.body.data': '{"message":"My refund, please"}',
        'http.request.header.x-webhook-secret': 'secret',
        'http.request.header.cookie': 'session=abc',
        'http.response.header.set-cookie': 'session=abc',
        'user.ip_address': '10.0.0.1',
        'client.address': '10.0.0.1',
        'network.peer.address': '10.0.0.1',
        'http.request.method': 'POST',
        'http.request.body.size': 31,
      },
    })

    expect(span.attributes).toEqual({ 'http.request.method': 'POST', 'http.request.body.size': 31 })
  })

  it('removes the content of model calls but keeps the model and token counts', () => {
    const span = scrubSentrySpan({
      name: 'generate_content gpt-5-nano',
      attributes: {
        'gen_ai.input.messages': '[{"role":"user","content":"My refund, please"}]',
        'gen_ai.output.messages': '[{"role":"assistant","content":"Hello"}]',
        'gen_ai.system_instructions': 'You answer support emails',
        'gen_ai.response.text': 'Hello',
        'ai.prompt': 'My refund, please',
        'vercel.ai.prompt': 'My refund, please',
        'gen_ai.request.model': 'gpt-5-nano',
        'gen_ai.usage.input_tokens': 12,
      },
    })

    expect(span.attributes).toEqual({
      'gen_ai.request.model': 'gpt-5-nano',
      'gen_ai.usage.input_tokens': 12,
    })
  })

  it('removes secrets, queries and emails from names and attributes', () => {
    const span = scrubSentrySpan({
      name: 'POST /api/webhooks/inbound-parse/abc123',
      attributes: {
        'url.full': 'https://example.com/api/tickets?search=Sam%20Lee',
        'http.query': '?search=Sam%20Lee',
        'url.query': { type: 'string', value: 'search=Sam%20Lee' },
        note: 'for sam@example.com',
      },
    })

    expect(JSON.stringify(span)).not.toMatch(/abc123|Sam|sam@example/)
    expect(span.name).toBe('POST /api/webhooks/inbound-parse/[secret]')
    expect(span.attributes?.['url.full' as never]).toBe('https://example.com/api/tickets')
  })
})

describe('scrubSentryEvent', () => {
  it('keeps only the url, method and user agent of a request', () => {
    const { request } = scrubSentryEvent({
      request: {
        url: 'https://example.com/api/contact',
        method: 'POST',
        headers: { 'User-Agent': 'Firefox', cookie: 'session=abc', 'x-webhook-secret': 'secret' },
        data: { message: 'My refund, please' },
        cookies: { session: 'abc' },
        query_string: 'token=abc',
      } as never,
    })

    expect(request).toEqual({
      url: 'https://example.com/api/contact',
      method: 'POST',
      headers: { 'User-Agent': 'Firefox' },
    })
  })

  it('removes the user', () => {
    const event = scrubSentryEvent({ user: { email: 'sam@example.com', ip_address: '10.0.0.1' } })

    expect(event.user).toBeUndefined()
  })

  it('removes email addresses wherever they appear', () => {
    const event = scrubSentryEvent({
      message: 'Could not email sam.lee+help@example.co.uk: rejected',
      breadcrumbs: [{ message: 'to "sam@example.com"' }],
    } as never)

    expect(JSON.stringify(event)).not.toContain('example')
    expect(JSON.stringify(event)).toContain('Could not email [email]: rejected')
  })

  it('leaves package versions in stack frames alone', () => {
    const filename = '/app/node_modules/.bun/react-router@8.5.1/index.js'

    const event = scrubSentryEvent({ filename } as never) as unknown as { filename: string }

    expect(event.filename).toBe(filename)
  })

  it('removes the inbound parse secret from urls and span names', () => {
    const event = scrubSentryEvent({
      transaction: 'POST /api/webhooks/inbound-parse/abc123',
      request: { url: 'https://example.com/api/webhooks/inbound-parse/abc123' },
    } as never)

    expect(JSON.stringify(event)).not.toContain('abc123')
    expect(JSON.stringify(event)).toContain('inbound-parse/[secret]')
  })

  it('removes query strings from API calls', () => {
    const event = scrubSentryEvent({
      breadcrumbs: [
        {
          data: {
            url: '/api/tickets?search=Sam%20Lee',
            'http.query': '?search=Sam%20Lee',
          },
        },
      ],
      spans: [{ description: 'GET https://example.com/api/tickets?search=Sam%20Lee' }],
    } as never)

    expect(JSON.stringify(event)).not.toContain('Sam')
    expect(JSON.stringify(event)).toContain('https://example.com/api/tickets"')
  })

  it('passes the SDK metadata through without serializing it', () => {
    const metadata: Record<string, unknown> = {}
    metadata.self = metadata

    const event = scrubSentryEvent({ sdkProcessingMetadata: metadata })

    expect(event.sdkProcessingMetadata).toBe(metadata)
  })
})
