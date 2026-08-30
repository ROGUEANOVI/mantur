import { getResendClient, EMAIL_FROM } from '@/lib/email/resend'

const APP_URL = 'https://mantur.co'

// Tourist-authored free text (booking notes) stored in the DB — escaped
// here before it's dropped into raw HTML, same reasoning as
// roleRequestEmails.ts's escapeHtml().
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function emailLayout(bodyHtml: string): string {
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #0a2b1e;">
      <p style="font-size: 20px; font-weight: 700; margin: 0 0 24px;">
        <span style="color: #0e7a54;">Man</span><span style="color: #e8a020;">Tur</span>
      </p>
      ${bodyHtml}
      <p style="margin-top: 32px; font-size: 12px; color: #6b7280;">
        Turismo con alma local · Manaure Balcón del Cesar
      </p>
    </div>
  `
}

function button(label: string, href: string): string {
  return `
    <a href="${href}" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #0e7a54; color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 14px;">
      ${label}
    </a>
  `
}

// booking_date is a plain `date` column (YYYY-MM-DD) — parsed as local
// year/month/day components, same technique already used in
// mis-reservas/page.tsx's formatDate(), so the displayed day never shifts
// due to UTC parsing (`new Date("2026-09-05")` parses as UTC midnight,
// which renders as the previous day in any timezone behind UTC).
function formatBookingDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export type BusinessBookingConfirmedParams = {
  serviceName: string
  touristName: string
  bookingDate: string
  quantity: number
  notes: string | null
}

export function businessBookingConfirmedEmail(params: BusinessBookingConfirmedParams): { subject: string; html: string } {
  const html = emailLayout(`
    <p style="font-size: 16px; margin: 0 0 12px;">Hola,</p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0 0 12px;">
      Tienes una nueva reserva confirmada para <strong>${escapeHtml(params.serviceName)}</strong>.
    </p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0 0 4px;">
      <strong>Turista:</strong> ${escapeHtml(params.touristName)}
    </p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0 0 4px;">
      <strong>Fecha:</strong> ${formatBookingDate(params.bookingDate)}
    </p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0;">
      <strong>Personas:</strong> ${params.quantity}
    </p>
    ${
      params.notes
        ? `<p style="font-size: 14px; line-height: 1.6; margin: 12px 0 0; padding: 12px 16px; background: #f5faf7; border-radius: 12px;">
             <strong>Notas del turista:</strong> ${escapeHtml(params.notes)}
           </p>`
        : ''
    }
    ${button('Ver mi panel', `${APP_URL}/mi-negocio`)}
  `)

  return { subject: 'Nueva reserva confirmada en ManTur', html }
}

export async function sendBusinessBookingConfirmedEmail(
  to: string,
  params: BusinessBookingConfirmedParams,
): Promise<void> {
  const { subject, html } = businessBookingConfirmedEmail(params)
  try {
    await getResendClient().emails.send({ from: EMAIL_FROM, to, subject, html })
  } catch (error) {
    // Email is a side effect of an already-committed DB change — a delivery
    // failure must never surface as a failure of the booking/payment itself.
    console.error('Failed to send business booking confirmed email', error)
  }
}
