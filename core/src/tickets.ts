import { z } from 'zod'

export type TicketStatus = 'open' | 'resolved' | 'closed'

export type TicketCategory = 'general_question' | 'technical_question' | 'refund_request'

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

export const ticketSearchMaxLength = 200
export const ticketPageSize = 20

// The query string of GET /api/tickets. Only these columns can be sorted, and
// without any parameters the first page of tickets is returned, newest first. Unknown
// parameters are rejected, so a mistyped filter can't silently return everything.
export const ticketQuerySchema = z.strictObject({
  sortBy: z
    .enum(['subject', 'senderName', 'status', 'category', 'createdAt'], 'Invalid sort column')
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc'], 'Invalid sort order').default('desc'),
  status: z.enum(['open', 'resolved', 'closed'], 'Invalid status').optional(),
  // "uncategorized" selects the tickets whose category is still empty.
  category: z
    .enum(
      ['general_question', 'technical_question', 'refund_request', 'uncategorized'],
      'Invalid category',
    )
    .optional(),
  // Blank once trimmed means no search. NUL characters would make PostgreSQL reject the query.
  search: z
    .string('Invalid search')
    .transform((value) => removeNulls(value).trim())
    .pipe(z.string().max(ticketSearchMaxLength, 'Search is too long'))
    .optional(),
  // Starts at 1. The upper limit keeps the database's row offset within range.
  page: z.coerce
    .number('Invalid page')
    .int('Invalid page')
    .min(1, 'Invalid page')
    .max(1_000_000, 'Invalid page')
    .default(1),
  pageSize: z.coerce
    .number('Invalid page size')
    .int('Invalid page size')
    .min(1, 'Invalid page size')
    .max(100, 'Invalid page size')
    .default(ticketPageSize),
})
