import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../lib/prisma.ts'
import { replyAddressFor, ticketIdFromReplyAddress } from '../lib/reply-address.ts'
import { inboundParseRouter } from './inbound-parse.ts'

vi.mock('../lib/prisma.ts', () => ({
  prisma: {
    $transaction: vi.fn(),
    ticket: { findUnique: vi.fn(), updateMany: vi.fn() },
    ticketReply: { create: vi.fn() },
  },
}))

const secret = 'a'.repeat(40)

let server: Server
let baseUrl: string

function deliver(fields: Record<string, string>, urlSecret = secret) {
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) form.set(name, value)
  return fetch(`${baseUrl}/api/webhooks/inbound-parse/${urlSecret}`, { method: 'POST', body: form })
}

function email(overrides: Record<string, string> = {}) {
  return {
    headers: 'Subject: Re: Your support request',
    from: 'Grace Student <Grace@test.dev>',
    text: 'It still fails.\n\nOn Mon, Nov 2, 2026 Jane <a@b.dev> wrote:\n> Hello',
    envelope: JSON.stringify({ to: [replyAddressFor(7)], from: 'grace@test.dev' }),
    attachments: '0',
    ...overrides,
  }
}

beforeAll(async () => {
  const app = express()
  app.use('/api/webhooks', inboundParseRouter)
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve())
  })
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
})

beforeEach(() => {
  vi.stubEnv('INBOUND_PARSE_SECRET', secret)
  vi.stubEnv('INBOUND_REPLY_DOMAIN', 'reply.test.dev')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.mocked(prisma.ticket.findUnique).mockResolvedValue({ senderEmail: 'grace@test.dev' } as never)
  vi.mocked(prisma.$transaction).mockResolvedValue([] as never)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  for (const mock of [
    prisma.$transaction,
    prisma.ticket.findUnique,
    prisma.ticket.updateMany,
    prisma.ticketReply.create,
  ]) {
    vi.mocked(mock).mockReset()
  }
})

describe('reply addresses', () => {
  it('finds the ticket from an address it issued, in any case', () => {
    expect(ticketIdFromReplyAddress(replyAddressFor(7)!)).toBe(7)
    expect(ticketIdFromReplyAddress(replyAddressFor(7)!.toUpperCase())).toBe(7)
  })

  it('rejects another ticket number, a wrong domain and other addresses', () => {
    const address = replyAddressFor(7)!

    expect(ticketIdFromReplyAddress(address.replace('ticket-7-', 'ticket-8-'))).toBeNull()
    expect(ticketIdFromReplyAddress(address.replace('reply.test.dev', 'evil.test'))).toBeNull()
    expect(ticketIdFromReplyAddress('support@reply.test.dev')).toBeNull()
  })

  it.each([
    ['INBOUND_PARSE_SECRET', ''],
    ['INBOUND_PARSE_SECRET', 'too-short'],
    ['INBOUND_PARSE_SECRET', `YOUR_${'a'.repeat(40)}`],
    ['INBOUND_REPLY_DOMAIN', ''],
  ])('gives no address when %s is %j, so replies go to EMAIL_FROM', (name, value) => {
    vi.stubEnv(name, value)

    expect(replyAddressFor(7)).toBeUndefined()
  })
})

describe('POST /api/webhooks/inbound-parse/:secret', () => {
  it('saves the reply without the quoted text and reopens the ticket', async () => {
    const res = await deliver(email())

    expect(res.status).toBe(201)
    expect(prisma.ticketReply.create).toHaveBeenCalledWith({
      data: { ticketId: 7, senderType: 'customer', body: 'It still fails.' },
    })
    expect(prisma.ticket.updateMany).toHaveBeenCalledWith({
      where: { id: 7, status: { in: ['resolved', 'closed'] } },
      data: { status: 'open', resolvedByAi: false, resolvedAt: null },
    })
    expect(prisma.ticket.updateMany).toHaveBeenCalledWith({
      where: { id: 7, assignedToId: 'jane-ai' },
      data: { assignedToId: null },
    })
    expect(prisma.$transaction).toHaveBeenCalledOnce()
  })

  it('accepts a match on the envelope when the From line differs', async () => {
    const res = await deliver(email({ from: 'Grace <grace+alias@test.dev>' }))

    expect(res.status).toBe(201)
  })

  it('notes attachments', async () => {
    await deliver(email({ text: 'See this', attachments: '1' }))

    expect(vi.mocked(prisma.ticketReply.create).mock.calls[0][0].data.body).toBe(
      'See this\n\n(This email had 1 attachment, which was not saved.)',
    )
  })

  it('refuses the wrong secret', async () => {
    const res = await deliver(email(), 'b'.repeat(40))

    expect(res.status).toBe(401)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('refuses everything when the secret is not set', async () => {
    vi.stubEnv('INBOUND_PARSE_SECRET', '')

    const res = await deliver(email())

    expect(res.status).toBe(503)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a request that is not a valid email', async () => {
    expect((await deliver({ text: 'no envelope' })).status).toBe(400)
    expect(
      (
        await fetch(`${baseUrl}/api/webhooks/inbound-parse/${secret}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  // Functions, because the reply address depends on the settings each test stubs.
  it.each<[string, () => Record<string, string>]>([
    [
      'an address this app did not issue',
      () => ({
        envelope: JSON.stringify({ to: ['ticket-7-abc@reply.test.dev'], from: 'grace@test.dev' }),
      }),
    ],
    ['an out-of-office answer', () => ({ headers: 'Auto-Submitted: auto-replied' })],
    [
      'someone other than the sender',
      () => ({
        from: 'Mallory <mallory@test.dev>',
        envelope: JSON.stringify({ to: [replyAddressFor(7)], from: 'mallory@test.dev' }),
      }),
    ],
    [
      'a bounce',
      () => ({
        from: 'Mail Delivery <mailer-daemon@test.dev>',
        envelope: JSON.stringify({ to: [replyAddressFor(7)], from: null }),
      }),
    ],
  ])('saves nothing for %s, and tells SendGrid to stop', async (_name, overrides) => {
    const res = await deliver(email(overrides()))

    expect(res.status).toBe(200)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('saves nothing when the ticket no longer exists', async () => {
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue(null)

    const res = await deliver(email())

    expect(res.status).toBe(200)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
