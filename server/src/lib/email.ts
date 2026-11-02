import sgMail from '@sendgrid/mail'

function isSet(value: string | undefined) {
  return Boolean(value) && !value?.startsWith('YOUR_')
}

// The names of the settings email still needs. Never their values, because this gets logged.
export function missingEmailSettings() {
  return ['SENDGRID_API_KEY', 'EMAIL_FROM'].filter((name) => !isSet(process.env[name]))
}

export function isEmailConfigured() {
  return missingEmailSettings().length === 0
}

// Plain text only, with tracking off, because these go to students about their own requests.
// Throws if SendGrid refuses the email.
export async function sendEmail(email: {
  to: string
  subject: string
  text: string
  // Marks an email no person wrote, so that auto-responders don't answer it and start a loop.
  automated?: boolean
}) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY!)
  await sgMail.send({
    to: email.to,
    from: process.env.EMAIL_FROM!,
    subject: email.subject,
    text: email.text,
    headers: email.automated ? { 'Auto-Submitted': 'auto-replied' } : undefined,
    trackingSettings: { clickTracking: { enable: false }, openTracking: { enable: false } },
  })
}
