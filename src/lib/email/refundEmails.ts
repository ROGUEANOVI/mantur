import { getResendClient, EMAIL_FROM } from '@/lib/email/resend'

const APP_URL = 'https://mantur.co'

// admin_notes / rejection reasons are admin-authored free text stored in
// the DB — escaped here before it's dropped into raw HTML, same reasoning
// as roleRequestEmails.ts's escapeHtml().
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

function formatCop(amountCents: number): string {
  return `$${Math.round(amountCents / 100).toLocaleString('es-CO')} COP`
}

export function refundProcessedEmail(
  refundAmountCents: number,
  method: 'void' | 'manual',
): { subject: string; html: string } {
  const methodNote =
    method === 'void'
      ? 'El reembolso se procesó automáticamente y debería reflejarse en tu medio de pago original en los próximos días hábiles.'
      : 'El reembolso se procesó mediante transferencia bancaria manual.'

  const html = emailLayout(`
    <p style="font-size: 16px; margin: 0 0 12px;">Hola,</p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0 0 8px;">
      Tu solicitud de reembolso fue procesada por <strong>${formatCop(refundAmountCents)}</strong>.
    </p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0;">
      ${methodNote}
    </p>
    ${button('Ver mis reservas', `${APP_URL}/mis-reservas`)}
  `)

  return { subject: 'Tu reembolso en ManTur fue procesado', html }
}

export function refundRejectedEmail(reason: string): { subject: string; html: string } {
  const html = emailLayout(`
    <p style="font-size: 16px; margin: 0 0 12px;">Hola,</p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0 0 8px;">
      Revisamos tu solicitud de reembolso y no fue posible aprobarla.
    </p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0 0 8px; padding: 12px 16px; background: #fef2f2; border-radius: 12px;">
      <strong>Motivo:</strong> ${escapeHtml(reason)}
    </p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0;">
      Si tienes dudas, escríbenos a soporte@mantur.co.
    </p>
    ${button('Ver mis reservas', `${APP_URL}/mis-reservas`)}
  `)

  return { subject: 'Tu solicitud de reembolso en ManTur no fue aprobada', html }
}

export async function sendRefundProcessedEmail(
  to: string,
  refundAmountCents: number,
  method: 'void' | 'manual',
): Promise<void> {
  const { subject, html } = refundProcessedEmail(refundAmountCents, method)
  try {
    await getResendClient().emails.send({ from: EMAIL_FROM, to, subject, html })
  } catch (error) {
    // Email is a side effect of an already-committed DB change — a delivery
    // failure must never surface as a failure of the refund itself.
    console.error('Failed to send refund processed email', error)
  }
}

export async function sendRefundRejectedEmail(to: string, reason: string): Promise<void> {
  const { subject, html } = refundRejectedEmail(reason)
  try {
    await getResendClient().emails.send({ from: EMAIL_FROM, to, subject, html })
  } catch (error) {
    console.error('Failed to send refund rejected email', error)
  }
}
