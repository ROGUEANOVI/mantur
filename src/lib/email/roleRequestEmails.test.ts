import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn()

vi.mock('@/lib/email/resend', () => ({
  getResendClient: () => ({ emails: { send: (...args: unknown[]) => sendMock(...args) } }),
  EMAIL_FROM: 'ManTur <notificaciones@mantur.co>',
}))

const {
  roleRequestApprovedEmail,
  roleRequestRejectedEmail,
  sendRoleRequestApprovedEmail,
  sendRoleRequestRejectedEmail,
} = await import('./roleRequestEmails')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('roleRequestApprovedEmail', () => {
  it('links to /mi-negocio for business_owner', () => {
    const { subject, html } = roleRequestApprovedEmail('business_owner')
    expect(subject).toBe('Tu solicitud en ManTur fue aprobada')
    expect(html).toContain('Dueño de negocio')
    expect(html).toContain('https://mantur.co/mi-negocio')
  })

  it('links to /mi-perfil-transporte for transporter', () => {
    const { html } = roleRequestApprovedEmail('transporter')
    expect(html).toContain('Transportador')
    expect(html).toContain('https://mantur.co/mi-perfil-transporte')
  })

  it('links to /mi-perfil-guia for tourist_guide', () => {
    const { html } = roleRequestApprovedEmail('tourist_guide')
    expect(html).toContain('Guía turístico')
    expect(html).toContain('https://mantur.co/mi-perfil-guia')
  })
})

describe('roleRequestRejectedEmail', () => {
  it('includes the role label, the reason, and a link back to /solicitar-rol', () => {
    const { subject, html } = roleRequestRejectedEmail('transporter', 'Placa ilegible en la foto')
    expect(subject).toBe('Tu solicitud en ManTur no fue aprobada')
    expect(html).toContain('Transportador')
    expect(html).toContain('Placa ilegible en la foto')
    expect(html).toContain('https://mantur.co/solicitar-rol')
  })

  it('escapes HTML in the admin-authored reason before embedding it', () => {
    const { html } = roleRequestRejectedEmail('business_owner', '<script>alert(1)</script>')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })
})

describe('sendRoleRequestApprovedEmail / sendRoleRequestRejectedEmail', () => {
  it('sends the approved email with the right recipient', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    await sendRoleRequestApprovedEmail('owner@example.com', 'business_owner')

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'owner@example.com', subject: 'Tu solicitud en ManTur fue aprobada' }),
    )
  })

  it('sends the rejected email with the right recipient and reason', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-2' }, error: null })
    await sendRoleRequestRejectedEmail('driver@example.com', 'transporter', 'Datos incompletos')

    const call = sendMock.mock.calls[0][0] as { to: string; html: string }
    expect(call.to).toBe('driver@example.com')
    expect(call.html).toContain('Datos incompletos')
  })

  it('does not throw when Resend rejects the send', async () => {
    sendMock.mockRejectedValue(new Error('network error'))
    await expect(sendRoleRequestApprovedEmail('owner@example.com', 'business_owner')).resolves.toBeUndefined()
    await expect(
      sendRoleRequestRejectedEmail('driver@example.com', 'transporter', 'motivo'),
    ).resolves.toBeUndefined()
  })
})
