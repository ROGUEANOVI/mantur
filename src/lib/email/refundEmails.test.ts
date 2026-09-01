import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn()

vi.mock('@/lib/email/resend', () => ({
  getResendClient: () => ({ emails: { send: (...args: unknown[]) => sendMock(...args) } }),
  EMAIL_FROM: 'ManTur <notificaciones@mantur.co>',
}))

const {
  refundProcessedEmail,
  refundRejectedEmail,
  sendRefundProcessedEmail,
  sendRefundRejectedEmail,
} = await import('./refundEmails')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('refundProcessedEmail', () => {
  it('formats the refunded amount in COP and mentions automatic processing for a void', () => {
    const { subject, html } = refundProcessedEmail(135_000_00, 'void')
    expect(subject).toBe('Tu reembolso en ManTur fue procesado')
    expect(html).toContain('$135.000 COP')
    expect(html).toContain('procesó automáticamente')
    expect(html).toContain('https://mantur.co/mis-reservas')
  })

  it('mentions manual bank transfer and the non-refundable processor fee deduction for a manual refund', () => {
    const { html } = refundProcessedEmail(50_000_00, 'manual')
    expect(html).toContain('transferencia bancaria manual')
    expect(html).toContain('comisión no reembolsable de la pasarela de pago')
  })
})

describe('refundRejectedEmail', () => {
  it('includes the reason and a link back to /mis-reservas', () => {
    const { subject, html } = refundRejectedEmail('La reserva ya fue utilizada')
    expect(subject).toBe('Tu solicitud de reembolso en ManTur no fue aprobada')
    expect(html).toContain('La reserva ya fue utilizada')
    expect(html).toContain('https://mantur.co/mis-reservas')
  })

  it('escapes HTML in the admin-authored reason before embedding it', () => {
    const { html } = refundRejectedEmail('<script>alert(1)</script>')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })
})

describe('sendRefundProcessedEmail / sendRefundRejectedEmail', () => {
  it('sends the processed email with the right recipient', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    await sendRefundProcessedEmail('tourist@example.com', 100_000_00, 'void')

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'tourist@example.com', subject: 'Tu reembolso en ManTur fue procesado' }),
    )
  })

  it('sends the rejected email with the right recipient and reason', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-2' }, error: null })
    await sendRefundRejectedEmail('tourist@example.com', 'Fuera de la ventana de cancelación')

    const call = sendMock.mock.calls[0][0] as { to: string; html: string }
    expect(call.to).toBe('tourist@example.com')
    expect(call.html).toContain('Fuera de la ventana de cancelación')
  })

  it('does not throw when Resend rejects the send', async () => {
    sendMock.mockRejectedValue(new Error('network error'))
    await expect(sendRefundProcessedEmail('tourist@example.com', 100_000, 'manual')).resolves.toBeUndefined()
    await expect(sendRefundRejectedEmail('tourist@example.com', 'motivo')).resolves.toBeUndefined()
  })
})
