// Imported first in main.tsx, so that Sentry starts before anything else. Without VITE_SENTRY_DSN
// nothing is sent.
import * as Sentry from '@sentry/react'
import { scrubSentryEvent, scrubSentrySpan } from 'core/sentry-scrub'
import { useEffect } from 'react'
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router'

// sendDefaultPii and dataCollection stay unset, because setting dataCollection at all turns on
// collecting user data. There is no Session Replay, because these pages show students' tickets.
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || undefined,
  environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
  // Set from Netlify's commit in vite.config.ts.
  release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
  integrations: [
    Sentry.reactRouterV7BrowserTracingIntegration({
      useEffect,
      useLocation,
      useNavigationType,
      createRoutesFromChildren,
      matchRoutes,
    }),
  ],
  tracesSampleRate: import.meta.env.PROD ? 0.1 : 1,
  beforeSend: (event) => scrubSentryEvent(event),
  beforeSendSpan: (span) => scrubSentrySpan(span),
})
