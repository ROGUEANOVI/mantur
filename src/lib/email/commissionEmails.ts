import { getResendClient, EMAIL_FROM } from '@/lib/email/resend'

const APP_URL = 'https://mantur.co'

// Provider names come from profiles/businesses the admin themselves manage
// — same defense-in-depth as refundEmails.ts, escaped before dropping into
// raw HTML.
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

const RECIPIENT_TYPE_LABEL: Record<string, string> = {
  business: 'Negocio',
  guide: 'Guía',
  transporter: 'Transportista',
}

export type CommissionReminderGroup = {
  recipientName: string
  recipientType: 'business' | 'guide' | 'transporter'
  subtotalCents: number
  count: number
}

// One row per provider that owes commission, subtotaled — the reminder is
// a "who do I need to collect from" nudge, not a line-by-line statement
// (that detail already lives in /admin/comisiones/pendientes).
export function commissionReminderEmail(
  groups: CommissionReminderGroup[],
  totalCents: number,
): { subject: string; html: string } {
  const rows = groups
    .map(
      (g) => `
        <tr>
          <td style="padding: 8px 0; font-size: 14px; border-bottom: 1px solid #e5e7eb;">
            ${escapeHtml(g.recipientName)}
            <span style="color: #6b7280;">(${RECIPIENT_TYPE_LABEL[g.recipientType] ?? g.recipientType})</span>
          </td>
          <td style="padding: 8px 0; font-size: 14px; text-align: right; border-bottom: 1px solid #e5e7eb;">
            ${formatCop(g.subtotalCents)}
          </td>
        </tr>
      `,
    )
    .join('')

  const html = emailLayout(`
    <p style="font-size: 16px; margin: 0 0 12px;">Hola,</p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
      Tienes <strong>${formatCop(totalCents)}</strong> en comisión pendiente de cobro de
      ${groups.length} proveedor${groups.length === 1 ? '' : 'es'}:
    </p>
    <table style="width: 100%; border-collapse: collapse;">
      ${rows}
    </table>
    ${button('Ver comisión pendiente', `${APP_URL}/admin/comisiones/pendientes`)}
  `)

  return { subject: `Comisión pendiente de cobro: ${formatCop(totalCents)}`, html }
}

export async function sendCommissionReminderEmail(
  to: string,
  groups: CommissionReminderGroup[],
  totalCents: number,
): Promise<void> {
  const { subject, html } = commissionReminderEmail(groups, totalCents)
  try {
    await getResendClient().emails.send({ from: EMAIL_FROM, to, subject, html })
  } catch (error) {
    // Email is a side effect of a scheduled summary run — a delivery
    // failure must never break the cron job for the other admins/groups.
    console.error('Failed to send commission reminder email', error)
  }
}
