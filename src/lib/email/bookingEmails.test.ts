import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn()

vi.mock('@/lib/email/resend', () => ({
  getResendClient: () => ({ emails: { send: (...args: unknown[]) => sendMock(...args) } }),
  EMAIL_FROM: 'ManTur <notificaciones@mantur.co>',
}))

const { businessBookingConfirmedEmail, sendBusinessBookingConfirmedEmail } = await import('./bookingEmails')

const PARAMS = {
  serviceName: 'Cabalgata al atardecer',
  touristName: 'Prueba Wompi Sandbox',
  bookingDate: '2026-09-05',
  quantity: 3,
  notes: null as string | null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('businessBookingConfirmedEmail', () => {
  it('includes the service name, tourist name, formatted date, and quantity', () => {
    const { subject, html } = businessBookingConfirmedEmail(PARAMS)
    expect(subject).toBe('Nueva reserva confirmada en ManTur')
    expect(html).toContain('Cabalgata al atardecer')
    expect(html).toContain('Prueba Wompi Sandbox')
    expect(html).toContain('sábado, 5 de septiembre de 2026')
    expect(html).toContain('Personas:</strong> 3')
    expect(html).toContain('https://mantur.co/mi-negocio')
  })

  it('does not parse booking_date as UTC (no off-by-one day)', () => {
    // 2026-09-01 parsed as UTC midnight would render as Aug 31 in any
    // timezone behind UTC — this asserts the local-component parsing holds.
    const { html } = businessBookingConfirmedEmail({ ...PARAMS, bookingDate: '2026-09-01' })
    expect(html).toContain('1 de septiembre de 2026')
  })

  it('omits the notes block when notes is null', () => {
    const { html } = businessBookingConfirmedEmail(PARAMS)
    expect(html).not.toContain('Notas del turista')
  })

  it('includes the notes block, escaped, when notes is present', () => {
    const { html } = businessBookingConfirmedEmail({ ...PARAMS, notes: 'Llegamos con <b>niños</b>' })
    expect(html).toContain('Notas del turista')
    expect(html).toContain('Llegamos con &lt;b&gt;niños&lt;/b&gt;')
    expect(html).not.toContain('Llegamos con <b>niños</b>')
  })
})

describe('sendBusinessBookingConfirmedEmail', () => {
  it('sends the email with the right recipient and subject', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    await sendBusinessBookingConfirmedEmail('negocio@example.com', PARAMS)

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'negocio@example.com', subject: 'Nueva reserva confirmada en ManTur' }),
    )
  })

  it('does not throw when Resend rejects the send', async () => {
    sendMock.mockRejectedValue(new Error('network error'))
    await expect(sendBusinessBookingConfirmedEmail('negocio@example.com', PARAMS)).resolves.toBeUndefined()
  })
})
