import { createHmac, timingSafeEqual } from 'node:crypto'

export function inboundParseSecret() {
  const secret = process.env.INBOUND_PARSE_SECRET
  return secret && secret.length >= 32 && !secret.startsWith('YOUR_') ? secret : null
}

// The address a ticket's emails ask students to reply to, or undefined when replies can't reach
// the app, so they go to EMAIL_FROM instead. The signature stops anyone adding a reply to a
// ticket by guessing its number, because only the ticket's sender is ever given this address.
export function replyAddressFor(ticketId: number) {
  const secret = inboundParseSecret()
  const domain = process.env.INBOUND_REPLY_DOMAIN?.trim().toLowerCase()
  if (!secret || !domain || domain.startsWith('your_')) return undefined

  const signature = createHmac('sha256', secret)
    .update(`ticket-reply:${ticketId}`)
    .digest('hex')
    .slice(0, 32)
  return `ticket-${ticketId}-${signature}@${domain}`
}

// The ticket a reply address belongs to, or null if this app didn't issue the address.
export function ticketIdFromReplyAddress(address: string) {
  const normalized = address.trim().toLowerCase()
  const id = Number(normalized.match(/^ticket-([1-9]\d{0,9})-/)?.[1])
  if (!id || id > 2_147_483_647) return null

  const expected = replyAddressFor(id)
  if (!expected || expected.length !== normalized.length) return null
  return timingSafeEqual(Buffer.from(expected), Buffer.from(normalized)) ? id : null
}
