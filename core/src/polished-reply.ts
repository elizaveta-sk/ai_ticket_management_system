import { z } from 'zod'

// What the model returns when polishing a reply. The server adds the names.
export const polishedReplySchema = z.object({
  greeting: z.string().describe('The greeting word only, with no name or punctuation, such as "Hi"'),
  message: z.string().describe('The rewritten message, with no greeting or sign-off'),
  signOff: z
    .string()
    .describe('The sign-off only, with no name or punctuation, such as "Best regards"'),
})

export type PolishedReply = z.infer<typeof polishedReplySchema>

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

const withoutEndPunctuation = (text: string) => text.trim().replace(/[\s,.!:]+$/, '')

// An email's name can contain line breaks, which would break up the reply.
const singleLine = (name: string) => name.trim().replace(/\s+/g, ' ')

const greetingWords =
  'hi|hello|hey|dear|greetings|good morning|good afternoon|good evening|hola|buenos días|buenas tardes|bonjour|salut|hallo|ciao|olá'

function removeGreeting(message: string, greeting: string, customerName: string) {
  const words = `${escapeRegExp(greeting)}|${greetingWords}`
  const fullName = escapeRegExp(customerName)
  const firstName = escapeRegExp(customerName.split(' ')[0])
  // A greeting word then punctuation or a line break, or the same with a name in between.
  // A full stop only counts straight after the word, as "Hi done." is a sentence.
  const inline = new RegExp(
    `^(?:${words})(?:[,!:.]+\\s*|\\s*\\n\\s*|[^\\S\\n]+(?:${fullName}|[\\p{L}'’-]+)(?:[,!:]+\\s*|\\s*\\n\\s*))`,
    'iu',
  )
  // In any language, a first paragraph of one word, or a short one with the customer's name.
  const firstParagraph = new RegExp(
    `^(?:\\p{L}+|[^\\n,]{0,30}(?:${firstName})[^\\n,]{0,20}),\\s*\\n\\s*\\n\\s*`,
    'iu',
  )
  const remaining = message.replace(inline, '').replace(firstParagraph, '')
  return remaining === message
    ? message
    : remaining.charAt(0).toUpperCase() + remaining.slice(1)
}

function removeSignOff(message: string, signOff: string, agentName: string) {
  const names = `${escapeRegExp(agentName)}|${escapeRegExp(agentName.split(' ')[0])}`
  // A short closing phrase and the agent's name, such as "Thanks, Ada" or "Regards,\nAda Lee".
  const signed = new RegExp(`(?:^|(?<=[.!?\\n]))\\s*[^.!?\\n]{0,30}[,\\n]\\s*(?:${names})[.!]?\\s*$`, 'iu')
  // The same words as the sign-off the reply is about to get.
  const unsigned = new RegExp(`(?:^|(?<=[.!?\\n]))\\s*${escapeRegExp(signOff)}[,.!]?\\s*$`, 'iu')
  return message.replace(signed, '').replace(unsigned, '').trim()
}

// Builds the reply from the model's parts. The model doesn't reliably leave greetings and
// sign-offs out of the message, especially when a reply is polished again, so they are
// removed here. Returns null if a part is empty, because that reply is unusable.
export function formatPolishedReply(
  parts: PolishedReply,
  names: { customerName: string; agentName: string },
) {
  const customerName = singleLine(names.customerName)
  const agentName = singleLine(names.agentName)
  const greeting = withoutEndPunctuation(parts.greeting)
  const signOff = withoutEndPunctuation(parts.signOff)
  if (!greeting || !signOff) return null

  const message = removeSignOff(
    removeGreeting(parts.message.trim(), greeting, customerName),
    signOff,
    agentName,
  )
  if (!message) return null

  // Without any comma, as a name written "Smith, John" would otherwise get two.
  const firstName = customerName.split(' ')[0].replace(/,+$/, '')
  return `${greeting} ${firstName},\n\n${message}\n\n${signOff},\n${agentName}`
}
