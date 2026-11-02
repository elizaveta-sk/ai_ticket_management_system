import { z } from 'zod'
import { removeGreeting, removeSignOff } from './polished-reply.ts'

export const knowledgeBaseAnswerSchema = z.object({
  canAnswer: z.boolean(),
  answer: z.string(),
})

export const autoAnswerMaxLength = 4_000

// Matches links and bare domains such as example.com. The knowledge base has none, so one
// in an answer can only have come from the student's email.
const linkPattern = /\b[a-z0-9-]+\.[a-z]{2,}\b/i

// Only an answer that passes this may go to a student without a person checking it. Anyone
// can submit the contact form with someone else's address, so an answer that repeats a link
// would turn these emails into spam for that person.
export function isSafeAutoAnswer(answer: string) {
  const text = answer.trim()
  return text.length > 0 && text.length <= autoAnswerMaxLength && !linkPattern.test(text)
}

const signOff = 'Best'
const signer = 'Jane'

// Anyone can type anything as their name on the contact form, and this email can go to someone
// else's address. So only a single name-like word gets through, which can't carry a link.
function greetingFor(senderName: string) {
  const firstName = senderName.trim().split(/\s+/)[0].replace(/,+$/, '')
  return /^\p{L}[\p{L}\p{M}'’-]{0,39}$/u.test(firstName) ? `Hi ${firstName},` : 'Hi there,'
}

export function formatAutoReply(answer: string, senderName: string) {
  // The model is told to leave these out, but doesn't reliably do so.
  const message = removeSignOff(removeGreeting(answer.trim(), 'Hi', senderName), signOff, signer)
  return [
    greetingFor(senderName),
    message,
    "This is an automated answer. If it doesn't solve your problem, reply to this email and a member of our team will help you.",
    `${signOff},\n${signer}\nSupport team`,
  ].join('\n\n')
}
