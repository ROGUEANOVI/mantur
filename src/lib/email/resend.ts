import { Resend } from 'resend'

// The Resend constructor throws synchronously when the API key is missing —
// instantiating it lazily (only when actually sending) keeps a missing/unset
// RESEND_API_KEY from crashing the build or every page that transitively
// imports this module. The real failure still surfaces at send time, inside
// the try/catch in roleRequestEmails.ts.
let client: Resend | null = null

export function getResendClient(): Resend {
  if (!client) client = new Resend(process.env.RESEND_API_KEY)
  return client
}

export const EMAIL_FROM = 'ManTur <notificaciones@mantur.co>'
