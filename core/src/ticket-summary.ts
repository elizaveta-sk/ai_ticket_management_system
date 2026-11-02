import type { ReplySenderType } from './tickets.ts'

export const summaryInputMaxLength = 60_000

const sender = { customer: 'student', agent: 'agent', ai: 'automated answer' } as const

// The thread as JSON for the model, oldest first. JSON keeps a student's text inside its
// own string, so it can't pass as part of the prompt. A long thread keeps the original
// message and the newest replies, and says how many were left out.
export function buildSummaryInput(ticket: {
  subject: string
  body: string
  replies: { senderType: ReplySenderType; body: string }[]
}) {
  let remaining = summaryInputMaxLength - ticket.subject.length - ticket.body.length
  const kept: { from: string; text: string }[] = []

  for (const reply of ticket.replies.toReversed()) {
    remaining -= reply.body.length
    if (remaining < 0) break
    kept.unshift({ from: sender[reply.senderType], text: reply.body })
  }

  const omitted = ticket.replies.length - kept.length
  return JSON.stringify({
    subject: ticket.subject,
    originalMessage: ticket.body,
    ...(omitted > 0 && { earlierRepliesLeftOut: omitted }),
    replies: kept,
  })
}
