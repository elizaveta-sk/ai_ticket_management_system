import { randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext } from '@playwright/test'

const URL = '/api/webhooks/inbound-email'
const secret = () => process.env.INBOUND_EMAIL_SECRET!

type Email = Record<string, unknown>

function validEmail(overrides: Email = {}): Email {
  return {
    messageId: `<${randomUUID()}@mail.example.com>`,
    from: `student-${randomUUID()}@example.com`,
    fromName: 'Test Student',
    subject: 'Help with my course',
    text: 'I cannot access the course materials.',
    ...overrides,
  }
}

function send(request: APIRequestContext, data: Email | string, headers?: Record<string, string>) {
  return request.post(URL, {
    data,
    headers: { 'x-webhook-secret': secret(), ...headers },
  })
}

test.describe('POST /api/webhooks/inbound-email', () => {
  test('creates an open ticket with no category without a session', async ({ request }) => {
    const res = await send(request, validEmail())
    expect(res.status()).toBe(201)
    const { ticket } = await res.json()
    expect(typeof ticket.id).toBe('number')
    expect(Number.isInteger(ticket.id)).toBe(true)
    expect(ticket.id).toBeGreaterThan(0)
    expect(ticket.status).toBe('open')
    expect(ticket.category).toBeNull()
  })

  test('returns 201 then 200 with the same ticket for a repeated messageId', async ({ request }) => {
    const email = validEmail()
    const first = await send(request, email)
    expect(first.status()).toBe(201)
    const second = await send(request, email)
    expect(second.status()).toBe(200)
    expect((await second.json()).ticket.id).toBe((await first.json()).ticket.id)
  })

  test('different messageIds create different tickets', async ({ request }) => {
    const a = await send(request, validEmail())
    const b = await send(request, validEmail())
    expect(a.status()).toBe(201)
    expect(b.status()).toBe(201)
    expect((await a.json()).ticket.id).not.toBe((await b.json()).ticket.id)
  })

  test('returns 401 with no secret header and creates nothing', async ({ request }) => {
    const email = validEmail()
    const res = await request.post(URL, { data: email })
    expect(res.status()).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })

    const after = await send(request, email)
    expect(after.status()).toBe(201)
  })

  test('returns 401 with a wrong secret and creates nothing', async ({ request }) => {
    const email = validEmail()
    const res = await send(request, email, { 'x-webhook-secret': `wrong-${randomUUID()}` })
    expect(res.status()).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })

    const after = await send(request, email)
    expect(after.status()).toBe(201)
  })

  test('rejects an email with no fromName and creates nothing', async ({ request }) => {
    const { fromName: _omit, ...email } = validEmail()

    const res = await send(request, email)
    expect(res.status()).toBe(400)
    expect(await res.json()).toEqual({ error: 'fromName is required' })

    const retry = await send(request, { ...email, fromName: 'Test Student' })
    expect(retry.status()).toBe(201)
  })


  test('accepts a text of about 500kb, above the app-wide 100kb limit', async ({ request }) => {
    const res = await send(request, validEmail({ text: 'a'.repeat(500 * 1024) }))
    expect(res.status()).toBe(201)
  })

  test('returns 413 for a body over 1mb', async ({ request }) => {
    const res = await send(request, validEmail({ text: 'a'.repeat(1024 * 1024 + 1024) }))
    expect(res.status()).toBe(413)
  })
})
