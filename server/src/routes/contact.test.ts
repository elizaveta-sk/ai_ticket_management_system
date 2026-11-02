import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { processTicketInBackground } from '../lib/process-ticket.ts'
import { prisma } from '../lib/prisma.ts'
import { contactRouter } from './contact.ts'

vi.mock('../lib/prisma.ts', () => ({
  prisma: { ticket: { create: vi.fn() } },
}))
vi.mock('../lib/process-ticket.ts', () => ({
  initialTicketStatus: () => 'new',
  processTicketInBackground: vi.fn(),
}))

const form = {
  name: 'Grace Student',
  email: 'Grace@Example.com',
  subject: 'Refund',
  message: 'Please refund me.',
}
const created = { id: 7, subject: 'Refund', body: 'Please refund me.' }

let server: Server
let baseUrl: string

function send(body: unknown) {
  return fetch(`${baseUrl}/api/contact`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use('/api', contactRouter)
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve())
  })
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
})

beforeEach(() => {
  vi.mocked(prisma.ticket.create).mockResolvedValue(created as never)
})

afterEach(() => {
  vi.mocked(prisma.ticket.create).mockReset()
  vi.mocked(processTicketInBackground).mockReset()
})

describe('POST /api/contact', () => {
  it('creates a ticket, classifies it and returns none of its details', async () => {
    const response = await send(form)

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ received: true })
    expect(vi.mocked(prisma.ticket.create).mock.calls[0][0].data).toEqual({
      messageId: expect.stringMatching(/^contact-/),
      senderEmail: 'grace@example.com',
      senderName: 'Grace Student',
      subject: 'Refund',
      body: 'Please refund me.',
      status: 'new',
    })
    expect(processTicketInBackground).toHaveBeenCalledWith(created)
  })

  it('gives each ticket a different message id', async () => {
    await send(form)
    await send(form)

    const [first, second] = vi.mocked(prisma.ticket.create).mock.calls
    expect(first[0].data.messageId).not.toBe(second[0].data.messageId)
  })

  it('rejects an invalid form without creating a ticket', async () => {
    const response = await send({ ...form, message: '   ' })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Enter a message' })
    expect(prisma.ticket.create).not.toHaveBeenCalled()
  })

  it('reports success for a filled-in trap field but creates nothing', async () => {
    const response = await send({ ...form, website: 'https://spam.example' })

    expect(response.status).toBe(201)
    expect(prisma.ticket.create).not.toHaveBeenCalled()
    expect(processTicketInBackground).not.toHaveBeenCalled()
  })

  // Last, because the limiter's counter lasts for the whole file.
  it('stops creating tickets after 20 requests in a minute', async () => {
    let response = await send(form)
    while (response.status === 201) response = await send(form)

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBeTruthy()
    // Fewer than 20, because the tests above used up part of the limit.
    expect(vi.mocked(prisma.ticket.create).mock.calls.length).toBeLessThan(20)
  })
})
