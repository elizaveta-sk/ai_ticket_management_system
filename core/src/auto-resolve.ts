import { z } from 'zod'

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

export function formatAutoReply(answer: string) {
  return [
    'Hello,',
    answer.trim(),
    "This is an automated answer. If it doesn't solve your problem, reply to this email and a member of our team will help you.",
    'Best regards,\nCode with Mosh Support',
  ].join('\n\n')
}
