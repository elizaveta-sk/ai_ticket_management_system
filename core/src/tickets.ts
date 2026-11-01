import { z } from 'zod'

export type TicketStatus = 'open' | 'resolved' | 'closed'

export type TicketCategory = 'general_question' | 'technical_question' | 'refund_request'

export const ticketCategories = [
  'general_question',
  'technical_question',
  'refund_request',
] as const satisfies readonly TicketCategory[]

export type ReplySenderType = 'agent' | 'customer'

// The shapes the tickets API returns as JSON, so dates are ISO strings.
export interface Ticket {
  id: number
  subject: string
  senderName: string
  senderEmail: string
  status: TicketStatus
  category: TicketCategory | null
  createdAt: string
}

export interface TicketAssignee {
  id: string
  name: string
}

export interface TicketReply {
  id: number
  body: string
  // Untrusted HTML, so it must be sanitized before it is ever rendered as HTML.
  bodyHtml: string | null
  senderType: ReplySenderType
  createdAt: string
  // Empty on customer replies, which come from the ticket's sender.
  author: { name: string } | null
}

// A single ticket: the list's fields plus what only its own page shows.
export interface TicketDetail extends Ticket {
  body: string
  assignedTo: TicketAssignee | null
  replies: TicketReply[]
}

// PostgreSQL text columns can't store NUL characters, which can appear in email.
const removeNulls = (value: string) => value.replaceAll('\0', '')

export const ticketEmailMaxLength = 100
export const ticketBodyMaxLength = 20_000

// The provider-neutral shape of an inbound email. An email provider's webhook
// format gets mapped to this when one is chosen.
export const inboundEmailSchema = z.object({
  // 512 keeps the value within the size PostgreSQL allows for a unique index.
  messageId: z.string().trim().min(1, 'messageId is required').max(512, 'messageId is too long'),
  from: z
    .email('from must be a valid email address')
    .max(ticketEmailMaxLength, `from must be at most ${ticketEmailMaxLength} characters`)
    .toLowerCase(),
  fromName: z
    .string('fromName is required')
    .transform((value) => removeNulls(value).trim())
    .pipe(z.string().min(1, 'fromName is required')),
  subject: z
    .string()
    .default('')
    .transform((value) => removeNulls(value).trim() || '(no subject)'),
  text: z
    .string()
    .default('')
    .transform(removeNulls)
    .pipe(z.string().max(ticketBodyMaxLength, `text must be at most ${ticketBodyMaxLength} characters`)),
})

export type InboundEmail = z.infer<typeof inboundEmailSchema>

// The id in a ticket's URL. Limited to what the database's integer column can hold.
export const ticketIdSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().max(2_147_483_647))

// The body of PATCH /api/tickets/:id: whichever fields are changing. A null assignee
// removes the current one, while a ticket's category can only change to another category.
// PostgreSQL rejects NUL characters outright, so they can't reach the agent lookup.
export const updateTicketSchema = z
  .strictObject({
    status: z.enum(['open', 'resolved', 'closed'], 'Invalid status').optional(),
    category: z
      .enum(['general_question', 'technical_question', 'refund_request'], 'Invalid category')
      .optional(),
    assignedToId: z
      .string('Invalid assignee')
      .regex(/^[^\0]+$/, 'Invalid assignee')
      .nullable()
      .optional(),
  })
  .refine((changes) => Object.keys(changes).length > 0, 'Nothing to update')

export const ticketReplyMaxLength = ticketBodyMaxLength

// The body of POST /api/tickets/:id/replies. The author comes from the session.
export const createReplySchema = z.strictObject({
  body: z
    .string('Reply is required')
    .transform((value) => removeNulls(value).trim())
    .pipe(
      z
        .string()
        .min(1, 'Reply is required')
        .max(ticketReplyMaxLength, `Reply must be at most ${ticketReplyMaxLength} characters`),
    ),
})

export type CreateReplyInput = z.infer<typeof createReplySchema>

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
