// Tickets hold students' names, emails and messages, and they must not reach Sentry. This runs on
// every event from the client and the server as the last step before it is sent.

const emailAddress = /[^\s"'<>@\\/:]+@[^\s"'<>@\\/]+\.[a-z]{2,}/gi
// The secret is part of this URL, because SendGrid Inbound Parse can't send a header.
const inboundParseSecret = /(inbound-parse\/)[^/?#"\s\\]+/g
// Ticket searches can contain a student's name or email.
const apiQueryString = /(\/api\/[^"?\s\\]*)\?[^"\s\\]*/g
const queryAttribute = /"(http\.query|url\.query)":("(?:[^"\\]|\\.)*"|\{[^{}]*\})/g
// Request bodies, headers (which include the webhook secret and cookies) and visitors' IP addresses.
const privateSpanAttribute =
  /^(http\.request\.body\.data$|http\.(request|response)\.header\.|user\.|client\.address$|network\.peer\.address$)/
// Model calls hold tickets and drafts, so of their attributes only these harmless ones are kept.
const aiSpanAttribute = /^(gen_ai|ai|vercel\.ai)\./
const safeAiSpanAttribute =
  /^gen_ai\.(usage\.|operation\.name$|system$|provider\.name$|request\.model$|response\.model$|response\.finish_reasons$)/

function isPrivateSpanAttribute(name: string) {
  return (
    privateSpanAttribute.test(name) || (aiSpanAttribute.test(name) && !safeAiSpanAttribute.test(name))
  )
}

type ScrubbableEvent = {
  request?: { url?: string; method?: string; headers?: Record<string, string> }
  user?: unknown
  sdkProcessingMetadata?: unknown
}

function keepUserAgent(headers: Record<string, string> = {}) {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => name.toLowerCase() === 'user-agent'),
  )
}

function scrubText(json: string) {
  return json
    .replace(emailAddress, '[email]')
    .replace(inboundParseSecret, '$1[secret]')
    .replace(apiQueryString, '$1')
    .replace(queryAttribute, '"$1":""')
}

// Traces are sent span by span and skip beforeSend, so they need this as well.
export function scrubSentrySpan<T extends { attributes?: object }>(span: T): T {
  const scrubbed: T = JSON.parse(scrubText(JSON.stringify(span)))
  if (scrubbed.attributes) {
    scrubbed.attributes = Object.fromEntries(
      Object.entries(scrubbed.attributes).filter(([name]) => !isPrivateSpanAttribute(name)),
    )
  }
  return scrubbed
}

export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T {
  // Used by the SDK and not sent as it is. It can hold objects that can't be turned into JSON.
  const { sdkProcessingMetadata, ...rest } = event
  const sent: ScrubbableEvent = rest
  if (sent.request) {
    // Leaves out the body, cookies, query string and other headers.
    sent.request = {
      url: sent.request.url,
      method: sent.request.method,
      headers: keepUserAgent(sent.request.headers),
    }
  }
  delete sent.user

  return { ...JSON.parse(scrubText(JSON.stringify(sent))), sdkProcessingMetadata }
}
