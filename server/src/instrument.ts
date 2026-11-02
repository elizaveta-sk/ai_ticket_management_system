// Loaded with `bun --preload`, so that Sentry starts before anything else. See the start and dev
// scripts in package.json. Without SENTRY_DSN nothing is sent.
import * as Sentry from '@sentry/bun'
import { scrubSentryEvent, scrubSentrySpan } from 'core/sentry-scrub'

const isProduction = process.env.NODE_ENV === 'production'

// sendDefaultPii and dataCollection stay unset, because setting dataCollection at all turns on
// collecting user data.
Sentry.init({
  dsn: process.env.SENTRY_DSN || undefined,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
  // Set by Render on each deploy.
  release: process.env.RENDER_GIT_COMMIT,
  tracesSampleRate: isProduction ? 0.1 : 1,
  // Request bodies hold contact forms and students' emails. scrubSentrySpan removes them as well.
  integrations: [
    Sentry.bunHttpServerIntegration({ maxRequestBodySize: 'none' }),
    // Model calls hold tickets and drafts. These default to on, even with sendDefaultPii unset.
    Sentry.vercelAIIntegration({ recordInputs: false, recordOutputs: false }),
  ],
  beforeSend: (event) => scrubSentryEvent(event),
  beforeSendSpan: (span) => scrubSentrySpan(span),
})
