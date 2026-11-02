import { captureException } from '@sentry/bun'

// For errors the code catches itself, which Sentry would otherwise never see. Sends a copy with
// only the name, message and stack, because the full error can include a student's email, a
// ticket or a draft reply.
export function reportError(error: unknown) {
  const safeError = new Error(error instanceof Error ? error.message : 'Unknown error')
  if (error instanceof Error) {
    safeError.name = error.name
    safeError.stack = error.stack
  }
  captureException(safeError)
}
