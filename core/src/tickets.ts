import { z } from 'zod'

// PostgreSQL text columns can't store NUL characters, which can appear in email.
const removeNulls = (value: string) => value.replaceAll('\0', '')

// The provider-neutral shape of an inbound email. An email provider's webhook
// format gets mapped to this when one is chosen.
export const inboundEmailSchema = z.object({
  // 512 keeps the value within the size PostgreSQL allows for a unique index.
  messageId: z.string().trim().min(1, 'messageId is required').max(512, 'messageId is too long'),
  from: z.email('from must be a valid email address').toLowerCase(),
  fromName: z
    .string('fromName is required')
    .transform((value) => removeNulls(value).trim())
    .pipe(z.string().min(1, 'fromName is required')),
  subject: z
    .string()
    .default('')
    .transform((value) => removeNulls(value).trim() || '(no subject)'),
  text: z.string().default('').transform(removeNulls),
})

export type InboundEmail = z.infer<typeof inboundEmailSchema>
