import { getResendClient, EMAIL_FROM } from '@/lib/email/resend'
import { roleRequestsCopy } from '@/lib/copy/roleRequests'

const APP_URL = 'https://mantur.co'

export type RequestableRole = 'business_owner' | 'transporter' | 'tourist_guide'

const PANEL_PATH: Record<RequestableRole, string> = {
  business_owner: '/mi-negocio',
  transporter: '/mi-perfil-transporte',
  tourist_guide: '/mi-perfil-guia',
}

// rejection_reason is admin-authored free text stored in the DB — escaped
// here defensively before it's dropped into raw HTML, same reasoning as
// the JSON-LD escaping in src/lib/seo/jsonLd.ts.
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

export function roleRequestApprovedEmail(role: RequestableRole): { subject: string; html: string } {
  const roleLabel = roleRequestsCopy.roles[role]
  const panelUrl = `${APP_URL}${PANEL_PATH[role]}`

  const html = emailLayout(`
    <p style="font-size: 16px; margin: 0 0 12px;">Hola,</p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0 0 8px;">
      Tu solicitud para unirte a ManTur como <strong>${roleLabel}</strong> fue aprobada.
    </p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0;">
      Ya podés entrar a tu panel para completar tu información y empezar a recibir turistas.
    </p>
    ${button('Ir a mi panel', panelUrl)}
  `)

  return { subject: 'Tu solicitud en ManTur fue aprobada', html }
}

export function roleRequestRejectedEmail(
  role: RequestableRole,
  reason: string,
): { subject: string; html: string } {
  const roleLabel = roleRequestsCopy.roles[role]

  const html = emailLayout(`
    <p style="font-size: 16px; margin: 0 0 12px;">Hola,</p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0 0 8px;">
      Tu solicitud para unirte a ManTur como <strong>${roleLabel}</strong> no fue aprobada.
    </p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0 0 8px; padding: 12px 16px; background: #fef2f2; border-radius: 12px;">
      <strong>Motivo:</strong> ${escapeHtml(reason)}
    </p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0;">
      Podés corregir lo que haga falta y volver a enviar tu solicitud cuando quieras.
    </p>
    ${button('Volver a aplicar', `${APP_URL}/solicitar-rol`)}
  `)

  return { subject: 'Tu solicitud en ManTur no fue aprobada', html }
}

export async function sendRoleRequestApprovedEmail(to: string, role: RequestableRole): Promise<void> {
  const { subject, html } = roleRequestApprovedEmail(role)
  try {
    await getResendClient().emails.send({ from: EMAIL_FROM, to, subject, html })
  } catch (error) {
    // Email is a side effect of an already-committed DB change — a delivery
    // failure must never surface as a failure of the approval/rejection itself.
    console.error('Failed to send role request approved email', error)
  }
}

export async function sendRoleRequestRejectedEmail(
  to: string,
  role: RequestableRole,
  reason: string,
): Promise<void> {
  const { subject, html } = roleRequestRejectedEmail(role, reason)
  try {
    await getResendClient().emails.send({ from: EMAIL_FROM, to, subject, html })
  } catch (error) {
    console.error('Failed to send role request rejected email', error)
  }
}
