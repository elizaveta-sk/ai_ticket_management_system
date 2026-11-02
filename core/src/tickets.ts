import { z } from 'zod'

export type TicketStatus = 'open' | 'resolved' | 'closed'

// What a ticket passes through before anyone sees it. Never shown outside the server.
export type InternalTicketStatus = 'new' | 'processing'

export const visibleTicketStatuses = [
  'open',
  'resolved',
  'closed',
] as const satisfies readonly TicketStatus[]

// A ticket the AI is still working on is, as far as anyone else can tell, an open ticket.
export function visibleTicketStatus(status: TicketStatus | InternalTicketStatus): TicketStatus {
  return status === 'new' || status === 'processing' ? 'open' : status
}

export type TicketCategory = 'general_question' | 'technical_question' | 'refund_request'

export const ticketCategories = [
  'general_question',
  'technical_question',
  'refund_request',
] as const satisfies readonly TicketCategory[]

export type ReplySenderType = 'agent' | 'customer' | 'ai'

// The shapes the tickets API returns as JSON, so dates are ISO strings.
export interface Ticket {
  id: number
  subject: string
  senderName: string
  senderEmail: string
  status: TicketStatus
  category: TicketCategory | null
  createdAt: string
  assignedTo: TicketAssignee | null
}

// The ready-made lists of tickets in the sidebar. See viewFilters in the tickets route.
export const ticketViews = ['attention', 'refunds', 'resolved', 'closed', 'all'] as const

export type TicketView = (typeof ticketViews)[number]
export type TicketViewCounts = Record<TicketView, number>

// The name on the AI's tickets and replies.
export const aiAgentName = 'Jane AI'

// One day on the dashboard's chart. The date is a UTC day, as YYYY-MM-DD.
export interface DailyTicketCount {
  date: string
  count: number
}

// What the dashboard shows. The percentage and average are null with nothing to work them out from.
export interface TicketStats {
  total: number
  open: number
  resolvedByAi: number
  resolvedByAiPercent: number | null
  averageResolutionSeconds: number | null
  ticketsPerDay: DailyTicketCount[]
}

const chartDays = 30
const dayInMs = 24 * 60 * 60 * 1_000

// The chart's days, oldest first and ending today. UTC, so they don't depend on where the server is.
export function chartDates(now: Date) {
  return Array.from({ length: chartDays }, (_, index) =>
    new Date(now.getTime() - (chartDays - 1 - index) * dayInMs).toISOString().slice(0, 10),
  )
}

// The database only returns days that have tickets, but the chart has to show the others as zero.
export function fillTicketsPerDay(counts: DailyTicketCount[], now: Date): DailyTicketCount[] {
  const byDate = new Map(counts.map(({ date, count }) => [date, count]))
  return chartDates(now).map((date) => ({ date, count: byDate.get(date) ?? 0 }))
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
  // Empty on customer replies, which come from the ticket's sender, and on AI replies.
  author: { name: string } | null
}

// A single ticket: the list's fields plus what only its own page shows.
export interface TicketDetail extends Ticket {
  body: string
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

export const contactNameMaxLength = 100
export const contactSubjectMaxLength = 200

function contactText(requiredMessage: string, maxLength: number, label: string) {
  return z
    .string(requiredMessage)
    .transform((value) => removeNulls(value).trim())
    .pipe(
      z
        .string()
        .min(1, requiredMessage)
        .max(maxLength, `${label} must be at most ${maxLength} characters`),
    )
}

// The public contact form, which creates a ticket without an email.
export const contactFormSchema = z.object({
  name: contactText('Enter your name', contactNameMaxLength, 'Name'),
  email: z
    .email('Enter a valid email address')
    .max(ticketEmailMaxLength, `Email must be at most ${ticketEmailMaxLength} characters`)
    .toLowerCase(),
  subject: contactText('Enter a subject', contactSubjectMaxLength, 'Subject'),
  message: contactText('Enter a message', ticketBodyMaxLength, 'Message'),
  // A trap for bots: people never see this field, so anything in it means spam.
  website: z.string().optional(),
})

export type ContactFormInput = z.input<typeof contactFormSchema>
export type ContactFormValues = z.output<typeof contactFormSchema>

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
  view: z.enum(ticketViews, 'Invalid view').default('all'),
  // NUL characters would make PostgreSQL reject the query.
  assignedToId: z
    .string('Invalid assignee')
    .regex(/^[^\0]+$/, 'Invalid assignee')
    .optional(),
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
