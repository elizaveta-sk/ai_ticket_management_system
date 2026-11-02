import { z } from 'zod'
import { ticketBodyMaxLength } from './tickets.ts'

// The envelope field of SendGrid's Inbound Parse webhook, sent as a JSON string. A bounce has
// no sender, so from can be null.
export const inboundEnvelopeSchema = z.object({
  to: z.array(z.string()),
  from: z.string().nullish(),
})

// Handles both "Grace Student <grace@test.dev>" and "grace@test.dev".
export function emailAddressIn(value: string) {
  return (value.match(/<([^<>]+)>\s*$/)?.[1] ?? value).trim().toLowerCase()
}

// An out-of-office answer or similar shouldn't add a reply or reopen a ticket.
export function isAutomaticEmail(headers: string) {
  return (
    /^auto-submitted:[ \t]*(?!no\b)\S/im.test(headers) ||
    /^precedence:[ \t]*(auto_reply|bulk|junk|list)\b/im.test(headers) ||
    /^x-autoreply:/im.test(headers) ||
    /^x-autorespond:/im.test(headers)
  )
}

// Finds where an email client started quoting the earlier message. The wording differs between
// clients and languages, so a heading it doesn't recognize stays in the reply, which only means
// an agent sees some repeated text.
function startsQuote(line: string, nextLine = '') {
  return (
    /^\s*On\b.*\bwrote:\s*$/i.test(line) ||
    (/^\s*On\b/i.test(line) && /\bwrote:\s*$/i.test(nextLine)) ||
    /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/i.test(line) ||
    /^\s*_{10,}\s*$/.test(line) ||
    (/^\s*From:\s/i.test(line) && /^\s*(Sent|Date):\s/i.test(nextLine))
  )
}

export function removeQuotedText(text: string) {
  const lines = text.replaceAll('\r\n', '\n').split('\n')
  const quoteStart = lines.findIndex((line, index) => startsQuote(line, lines[index + 1]))
  const kept = quoteStart === -1 ? lines : lines.slice(0, quoteStart)
  // Lines quoted between a student's own lines stay, since those lines answer them.
  while (kept.length > 0 && /^\s*(>.*)?$/.test(kept[kept.length - 1])) kept.pop()
  // Never lose a message just because all of it looked quoted.
  return kept.join('\n').trim() || text.trim()
}

// Only used as plain text, which the client never renders as HTML.
function textFromHtml(html: string) {
  return html
    .replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(br|\/p|\/div)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replaceAll('&nbsp;', ' ')
    .replace(/[ \t]+/g, ' ')
}

// What a student's email reply saves as. Attachments aren't stored, so this says they existed.
export function customerReplyBody(email: { text: string; html: string; attachments: number }) {
  const source = email.text.trim() ? email.text : textFromHtml(email.html)
  const message = removeQuotedText(source.replaceAll('\0', '')) || '(This email had no text.)'
  const note =
    email.attachments > 0
      ? `\n\n(This email had ${email.attachments} attachment${email.attachments === 1 ? '' : 's'}, which ${email.attachments === 1 ? 'was' : 'were'} not saved.)`
      : ''
  return message.slice(0, ticketBodyMaxLength - note.length) + note
}
