import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn()

vi.mock('@/lib/email/resend', () => ({
  getResendClient: () => ({ emails: { send: (...args: unknown[]) => sendMock(...args) } }),
  EMAIL_FROM: 'ManTur <notificaciones@mantur.co>',
}))

const { commissionReminderEmail, sendCommissionReminderEmail } = await import('./commissionEmails')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('commissionReminderEmail', () => {
  it('formats the total, pluralizes the provider count, lists each group subtotal, and links to the pending report', () => {
    const { subject, html } = commissionReminderEmail(
      [
        { recipientName: 'Finca El Paraíso', recipientType: 'business', subtotalCents: 12_000_00, count: 2 },
        { recipientName: 'Ana Pérez', recipientType: 'guide', subtotalCents: 6_000_00, count: 1 },
      ],
      18_000_00,
    )

    expect(subject).toBe('Comisión pendiente de cobro: $18.000 COP')
    expect(html).toContain('$18.000 COP')
    expect(html).toContain('2 proveedores')
    expect(html).toContain('Finca El Paraíso')
    expect(html).toContain('(Negocio)')
    expect(html).toContain('$12.000 COP')
    expect(html).toContain('Ana Pérez')
    expect(html).toContain('(Guía)')
    expect(html).toContain('$6.000 COP')
    expect(html).toContain('https://mantur.co/admin/comisiones/pendientes')
  })

  it('uses the singular "proveedor" for a single group', () => {
    const { html } = commissionReminderEmail(
      [{ recipientName: 'Moto Express', recipientType: 'transporter', subtotalCents: 3_000_00, count: 1 }],
      3_000_00,
    )
    expect(html).toContain('1 proveedor:')
    expect(html).not.toContain('1 proveedores')
  })

  it('escapes HTML in the recipient name before embedding it', () => {
    const { html } = commissionReminderEmail(
      [{ recipientName: '<script>alert(1)</script>', recipientType: 'business', subtotalCents: 1_000_00, count: 1 }],
      1_000_00,
    )
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })
})

describe('sendCommissionReminderEmail', () => {
  it('sends with the right recipient and subject', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    await sendCommissionReminderEmail(
      'admin@mantur.co',
      [{ recipientName: 'Finca El Paraíso', recipientType: 'business', subtotalCents: 10_000_00, count: 1 }],
      10_000_00,
    )

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'admin@mantur.co', subject: 'Comisión pendiente de cobro: $10.000 COP' }),
    )
  })

  it('does not throw when Resend rejects the send', async () => {
    sendMock.mockRejectedValue(new Error('network error'))
    await expect(
      sendCommissionReminderEmail('admin@mantur.co', [], 0),
    ).resolves.toBeUndefined()
  })
})
