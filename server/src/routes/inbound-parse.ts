import {
  customerReplyBody,
  emailAddressIn,
  inboundEnvelopeSchema,
  isAutomaticEmail,
} from 'core/email-reply'
import express, { Router } from 'express'
import { SenderType, TicketStatus } from '../generated/prisma/client.ts'
import { prisma } from '../lib/prisma.ts'
import { ticketIdFromReplyAddress } from '../lib/reply-address.ts'
import { unassignAiAgentQuery } from '../lib/ticket-state.ts'
import { requireInboundParseSecret } from '../middleware/require-webhook-secret.ts'

export const inboundParseRouter = Router()

type Form = Awaited<ReturnType<Response['formData']>>

function field(form: Form, name: string) {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

async function readForm(req: express.Request) {
  try {
    return await new Response(req.body, {
      headers: { 'content-type': req.get('content-type') ?? '' },
    }).formData()
  } catch {
    return null
  }
}

function readEnvelope(form: Form) {
  try {
    return inboundEnvelopeSchema.safeParse(JSON.parse(field(form, 'envelope'))).data ?? null
  } catch {
    return null
  }
}

// Logged with no email content. SendGrid retries anything but a 2xx, so an email that will never
// be accepted gets a 200 to stop it trying.
function ignore(res: express.Response, reason: string) {
  console.log(`Inbound email ignored: ${reason}`)
  res.status(200).json({ saved: false })
}

// A student's answer to one of our emails, delivered by SendGrid's Inbound Parse. It becomes a
// reply on the ticket that the Reply-To address belongs to, and reopens that ticket for an agent.
// The AI doesn't answer these. SendGrid accepts emails up to 30MB, and the secret is checked
// before any of it is read.
inboundParseRouter.post(
  '/inbound-parse/:secret',
  requireInboundParseSecret,
  express.raw({ type: 'multipart/form-data', limit: '30mb' }),
  async (req, res) => {
    const form = Buffer.isBuffer(req.body) ? await readForm(req) : null
    const envelope = form && readEnvelope(form)
    if (!form || !envelope) {
      res.status(400).json({ error: 'Invalid email' })
      return
    }

    const ticketId = envelope.to
      .map(ticketIdFromReplyAddress)
      .find((id): id is number => id !== null)
    if (!ticketId) return ignore(res, 'not sent to a valid reply address')
    if (isAutomaticEmail(field(form, 'headers'))) {
      return ignore(res, `automatic email on ticket ${ticketId}`)
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { senderEmail: true },
    })
    if (!ticket) return ignore(res, `ticket ${ticketId} does not exist`)

    // Replies show as coming from the ticket's sender, so someone they forwarded the email to
    // can't add one. Mail servers can rewrite the envelope's sender, so either address counts.
    const senderEmail = ticket.senderEmail.toLowerCase()
    const senders = [field(form, 'from'), envelope.from ?? ''].map(emailAddressIn)
    if (!senders.includes(senderEmail)) {
      return ignore(res, `sender does not match ticket ${ticketId}`)
    }

    await prisma.$transaction([
      prisma.ticketReply.create({
        data: {
          ticketId,
          senderType: SenderType.customer,
          body: customerReplyBody({
            text: field(form, 'text'),
            html: field(form, 'html'),
            attachments: Number(field(form, 'attachments')) || 0,
          }),
        },
      }),
      // The same as an agent reopening it, so an AI-resolved ticket joins the list again.
      prisma.ticket.updateMany({
        where: { id: ticketId, status: { in: [TicketStatus.resolved, TicketStatus.closed] } },
        data: { status: TicketStatus.open, resolvedByAi: false, resolvedAt: null },
      }),
      unassignAiAgentQuery(ticketId),
    ])
    console.log(`Customer reply saved on ticket ${ticketId}`)
    res.status(201).json({ saved: true })
  },
)
