import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn()

vi.mock('@/lib/email/resend', () => ({
  getResendClient: () => ({ emails: { send: (...args: unknown[]) => sendMock(...args) } }),
  EMAIL_FROM: 'ManTur <notificaciones@mantur.co>',
}))

const {
  businessBookingConfirmedEmail,
  sendBusinessBookingConfirmedEmail,
  guideBookingConfirmedEmail,
  sendGuideBookingConfirmedEmail,
  packagePrereservaRequestedEmail,
  sendPackagePrereservaRequestedEmail,
  packagePrereservaConfirmedEmail,
  sendPackagePrereservaConfirmedEmail,
  packagePrereservaCancelledEmail,
  sendPackagePrereservaCancelledEmail,
  packageBookingPaidEmail,
  sendPackageBookingPaidEmail,
  packageProvidersConfirmedEmail,
  sendPackageProvidersConfirmedEmail,
  packageProvidersCancelledEmail,
  sendPackageProvidersCancelledEmail,
  packageProvidersPayoutSentEmail,
  sendPackageProvidersPayoutSentEmail,
  serviceBookingCancelledEmail,
  sendServiceBookingCancelledEmail,
  guideTourBookingCancelledEmail,
  sendGuideTourBookingCancelledEmail,
  transporterRouteRequestPendingEmail,
  sendTransporterRouteRequestPendingEmail,
} = await import('./bookingEmails')

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

const GUIDE_PARAMS = {
  tourName: 'Caminata a Los Pinos',
  touristName: 'Prueba Wompi Sandbox',
  bookingDate: '2026-09-05',
  quantity: 2,
  notes: null as string | null,
}

describe('guideBookingConfirmedEmail', () => {
  it('includes the tour name, tourist name, formatted date, and quantity', () => {
    const { subject, html } = guideBookingConfirmedEmail(GUIDE_PARAMS)
    expect(subject).toBe('Nueva reserva confirmada en ManTur')
    expect(html).toContain('Caminata a Los Pinos')
    expect(html).toContain('Prueba Wompi Sandbox')
    expect(html).toContain('sábado, 5 de septiembre de 2026')
    expect(html).toContain('Personas:</strong> 2')
    expect(html).toContain('https://mantur.co/mi-perfil-guia')
  })

  it('does not parse booking_date as UTC (no off-by-one day)', () => {
    const { html } = guideBookingConfirmedEmail({ ...GUIDE_PARAMS, bookingDate: '2026-09-01' })
    expect(html).toContain('1 de septiembre de 2026')
  })

  it('omits the notes block when notes is null', () => {
    const { html } = guideBookingConfirmedEmail(GUIDE_PARAMS)
    expect(html).not.toContain('Notas del turista')
  })

  it('includes the notes block, escaped, when notes is present', () => {
    const { html } = guideBookingConfirmedEmail({ ...GUIDE_PARAMS, notes: 'Llegamos con <b>niños</b>' })
    expect(html).toContain('Notas del turista')
    expect(html).toContain('Llegamos con &lt;b&gt;niños&lt;/b&gt;')
    expect(html).not.toContain('Llegamos con <b>niños</b>')
  })
})

describe('sendGuideBookingConfirmedEmail', () => {
  it('sends the email with the right recipient and subject', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    await sendGuideBookingConfirmedEmail('guia@example.com', GUIDE_PARAMS)

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'guia@example.com', subject: 'Nueva reserva confirmada en ManTur' }),
    )
  })

  it('does not throw when Resend rejects the send', async () => {
    sendMock.mockRejectedValue(new Error('network error'))
    await expect(sendGuideBookingConfirmedEmail('guia@example.com', GUIDE_PARAMS)).resolves.toBeUndefined()
  })
})

const PACKAGE_REQUESTED_PARAMS = {
  packageName: 'Ruta Serranía del Perijá',
  touristName: 'Ana Pérez',
  bookingDate: '2026-09-05',
  quantity: 2,
  notes: null as string | null,
}

describe('packagePrereservaRequestedEmail', () => {
  it('includes the package name, tourist name, formatted date, quantity, and a link to the admin queue', () => {
    const { subject, html } = packagePrereservaRequestedEmail(PACKAGE_REQUESTED_PARAMS)
    expect(subject).toBe('Nueva solicitud de paquete: Ruta Serranía del Perijá')
    expect(html).toContain('Ruta Serranía del Perijá')
    expect(html).toContain('Ana Pérez')
    expect(html).toContain('sábado, 5 de septiembre de 2026')
    expect(html).toContain('Cantidad:</strong> 2')
    expect(html).toContain('https://mantur.co/admin/paquetes/solicitudes')
  })

  it('omits the notes block when notes is null', () => {
    const { html } = packagePrereservaRequestedEmail(PACKAGE_REQUESTED_PARAMS)
    expect(html).not.toContain('Notas del turista')
  })

  it('includes the notes block, escaped, when notes is present', () => {
    const { html } = packagePrereservaRequestedEmail({ ...PACKAGE_REQUESTED_PARAMS, notes: 'Llegamos con <b>niños</b>' })
    expect(html).toContain('Notas del turista')
    expect(html).toContain('Llegamos con &lt;b&gt;niños&lt;/b&gt;')
    expect(html).not.toContain('Llegamos con <b>niños</b>')
  })
})

describe('sendPackagePrereservaRequestedEmail', () => {
  it('sends the email with the right recipient and subject', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    await sendPackagePrereservaRequestedEmail('admin@mantur.co', PACKAGE_REQUESTED_PARAMS)

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'admin@mantur.co', subject: 'Nueva solicitud de paquete: Ruta Serranía del Perijá' }),
    )
  })

  it('does not throw when Resend rejects the send', async () => {
    sendMock.mockRejectedValue(new Error('network error'))
    await expect(sendPackagePrereservaRequestedEmail('admin@mantur.co', PACKAGE_REQUESTED_PARAMS)).resolves.toBeUndefined()
  })
})

const PACKAGE_CONFIRMED_PARAMS = {
  packageName: 'Ruta Serranía del Perijá',
  touristName: 'Ana Pérez',
  bookingDate: '2026-09-05',
  bookingId: 'booking-1',
}

describe('packagePrereservaConfirmedEmail', () => {
  it('includes the package name, tourist name, formatted date, and a WhatsApp CTA', () => {
    const { subject, html } = packagePrereservaConfirmedEmail(PACKAGE_CONFIRMED_PARAMS)
    expect(subject).toBe('Disponibilidad confirmada: Ruta Serranía del Perijá')
    expect(html).toContain('Ruta Serranía del Perijá')
    expect(html).toContain('Ana Pérez')
    expect(html).toContain('sábado, 5 de septiembre de 2026')
    expect(html).toContain('https://wa.me/573217203264')
  })

  it('escapes the tourist name', () => {
    const { html } = packagePrereservaConfirmedEmail({ ...PACKAGE_CONFIRMED_PARAMS, touristName: '<b>Ana</b>' })
    expect(html).toContain('&lt;b&gt;Ana&lt;/b&gt;')
    expect(html).not.toContain('<b>Ana</b>')
  })
})

describe('sendPackagePrereservaConfirmedEmail', () => {
  it('sends with the right recipient and subject', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    await sendPackagePrereservaConfirmedEmail('turista@example.com', PACKAGE_CONFIRMED_PARAMS)
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'turista@example.com', subject: 'Disponibilidad confirmada: Ruta Serranía del Perijá' }),
    )
  })

  it('does not throw when Resend rejects the send', async () => {
    sendMock.mockRejectedValue(new Error('network error'))
    await expect(sendPackagePrereservaConfirmedEmail('turista@example.com', PACKAGE_CONFIRMED_PARAMS)).resolves.toBeUndefined()
  })
})

const PACKAGE_CANCELLED_PARAMS = {
  packageName: 'Ruta Serranía del Perijá',
  touristName: 'Ana Pérez',
  bookingDate: '2026-09-05',
}

describe('packagePrereservaCancelledEmail', () => {
  it('includes the package name, states no charge was made, and a WhatsApp CTA', () => {
    const { subject, html } = packagePrereservaCancelledEmail(PACKAGE_CANCELLED_PARAMS)
    expect(subject).toBe('Tu solicitud de "Ruta Serranía del Perijá" fue cancelada')
    expect(html).toContain('No se realizó ningún cobro')
    expect(html).toContain('https://wa.me/573217203264')
  })
})

describe('sendPackagePrereservaCancelledEmail', () => {
  it('sends with the right recipient and subject', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    await sendPackagePrereservaCancelledEmail('turista@example.com', PACKAGE_CANCELLED_PARAMS)
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'turista@example.com', subject: 'Tu solicitud de "Ruta Serranía del Perijá" fue cancelada' }),
    )
  })

  it('does not throw when Resend rejects the send', async () => {
    sendMock.mockRejectedValue(new Error('network error'))
    await expect(sendPackagePrereservaCancelledEmail('turista@example.com', PACKAGE_CANCELLED_PARAMS)).resolves.toBeUndefined()
  })
})

const PACKAGE_PAID_PARAMS = {
  packageName: 'Ruta Serranía del Perijá',
  touristName: 'Ana Pérez',
  bookingDate: '2026-09-05',
  bookingId: 'booking-1',
}

describe('packageBookingPaidEmail', () => {
  it('includes the package name and a link to the confirmation page', () => {
    const { subject, html } = packageBookingPaidEmail(PACKAGE_PAID_PARAMS)
    expect(subject).toBe('¡Reserva confirmada! Ruta Serranía del Perijá')
    expect(html).toContain('https://mantur.co/reservas/booking-1/confirmacion')
  })
})

describe('sendPackageBookingPaidEmail', () => {
  it('sends with the right recipient and subject', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    await sendPackageBookingPaidEmail('turista@example.com', PACKAGE_PAID_PARAMS)
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'turista@example.com', subject: '¡Reserva confirmada! Ruta Serranía del Perijá' }),
    )
  })

  it('does not throw when Resend rejects the send', async () => {
    sendMock.mockRejectedValue(new Error('network error'))
    await expect(sendPackageBookingPaidEmail('turista@example.com', PACKAGE_PAID_PARAMS)).resolves.toBeUndefined()
  })
})

const PACKAGE_PROVIDER_PARAMS = {
  packageName: 'Ruta Serranía del Perijá',
  bookingDate: '2026-09-05',
  panelUrl: 'https://mantur.co/mi-negocio',
}

describe('packageProvidersConfirmedEmail', () => {
  it('includes the package name, date, and the given panel link', () => {
    const { subject, html } = packageProvidersConfirmedEmail(PACKAGE_PROVIDER_PARAMS)
    expect(subject).toBe('Disponibilidad confirmada: Ruta Serranía del Perijá')
    expect(html).toContain('Ruta Serranía del Perijá')
    expect(html).toContain('https://mantur.co/mi-negocio')
  })

  it('uses whichever panelUrl is passed in (guide vs business)', () => {
    const { html } = packageProvidersConfirmedEmail({ ...PACKAGE_PROVIDER_PARAMS, panelUrl: 'https://mantur.co/mi-perfil-guia' })
    expect(html).toContain('https://mantur.co/mi-perfil-guia')
  })
})

describe('sendPackageProvidersConfirmedEmail', () => {
  it('sends with the right recipient and subject', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    await sendPackageProvidersConfirmedEmail('negocio@example.com', PACKAGE_PROVIDER_PARAMS)
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'negocio@example.com', subject: 'Disponibilidad confirmada: Ruta Serranía del Perijá' }),
    )
  })

  it('does not throw when Resend rejects the send', async () => {
    sendMock.mockRejectedValue(new Error('network error'))
    await expect(sendPackageProvidersConfirmedEmail('negocio@example.com', PACKAGE_PROVIDER_PARAMS)).resolves.toBeUndefined()
  })
})

describe('packageProvidersCancelledEmail', () => {
  it('includes the package name and panel link', () => {
    const { subject, html } = packageProvidersCancelledEmail(PACKAGE_PROVIDER_PARAMS)
    expect(subject).toBe('Solicitud cancelada: Ruta Serranía del Perijá')
    expect(html).toContain('https://mantur.co/mi-negocio')
  })
})

describe('sendPackageProvidersCancelledEmail', () => {
  it('sends with the right recipient and subject', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    await sendPackageProvidersCancelledEmail('negocio@example.com', PACKAGE_PROVIDER_PARAMS)
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'negocio@example.com', subject: 'Solicitud cancelada: Ruta Serranía del Perijá' }),
    )
  })

  it('does not throw when Resend rejects the send', async () => {
    sendMock.mockRejectedValue(new Error('network error'))
    await expect(sendPackageProvidersCancelledEmail('negocio@example.com', PACKAGE_PROVIDER_PARAMS)).resolves.toBeUndefined()
  })
})

const PACKAGE_PROVIDER_PAYOUT_PARAMS = {
  ...PACKAGE_PROVIDER_PARAMS,
  amountCents: 175000,
}

describe('packageProvidersPayoutSentEmail', () => {
  it('includes the formatted COP amount and panel link', () => {
    const { subject, html } = packageProvidersPayoutSentEmail(PACKAGE_PROVIDER_PAYOUT_PARAMS)
    expect(subject).toBe('Pago en camino: Ruta Serranía del Perijá')
    expect(html).toContain('$1.750')
    expect(html).toContain('https://mantur.co/mi-negocio')
  })
})

describe('sendPackageProvidersPayoutSentEmail', () => {
  it('sends with the right recipient and subject', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    await sendPackageProvidersPayoutSentEmail('negocio@example.com', PACKAGE_PROVIDER_PAYOUT_PARAMS)
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'negocio@example.com', subject: 'Pago en camino: Ruta Serranía del Perijá' }),
    )
  })

  it('does not throw when Resend rejects the send', async () => {
    sendMock.mockRejectedValue(new Error('network error'))
    await expect(sendPackageProvidersPayoutSentEmail('negocio@example.com', PACKAGE_PROVIDER_PAYOUT_PARAMS)).resolves.toBeUndefined()
  })
})

const SERVICE_CANCELLED_PARAMS = {
  serviceName: 'Cabalgata al atardecer',
  touristName: 'Ana Pérez',
  bookingDate: '2026-09-05',
}

describe('serviceBookingCancelledEmail', () => {
  it('includes the service name, states no charge was made, and a WhatsApp CTA', () => {
    const { subject, html } = serviceBookingCancelledEmail(SERVICE_CANCELLED_PARAMS)
    expect(subject).toBe('Tu reserva de "Cabalgata al atardecer" fue cancelada')
    expect(html).toContain('No se realizó ningún cobro')
    expect(html).toContain('https://wa.me/573217203264')
  })

  it('does not parse booking_date as UTC (no off-by-one day)', () => {
    const { html } = serviceBookingCancelledEmail({ ...SERVICE_CANCELLED_PARAMS, bookingDate: '2026-09-01' })
    expect(html).toContain('1 de septiembre de 2026')
  })
})

describe('sendServiceBookingCancelledEmail', () => {
  it('sends with the right recipient and subject', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    await sendServiceBookingCancelledEmail('turista@example.com', SERVICE_CANCELLED_PARAMS)
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'turista@example.com', subject: 'Tu reserva de "Cabalgata al atardecer" fue cancelada' }),
    )
  })

  it('does not throw when Resend rejects the send', async () => {
    sendMock.mockRejectedValue(new Error('network error'))
    await expect(sendServiceBookingCancelledEmail('turista@example.com', SERVICE_CANCELLED_PARAMS)).resolves.toBeUndefined()
  })
})

const GUIDE_TOUR_CANCELLED_PARAMS = {
  tourName: 'Caminata a Los Pinos',
  touristName: 'Ana Pérez',
  bookingDate: '2026-09-05',
}

describe('guideTourBookingCancelledEmail', () => {
  it('includes the tour name, states no charge was made, and a WhatsApp CTA', () => {
    const { subject, html } = guideTourBookingCancelledEmail(GUIDE_TOUR_CANCELLED_PARAMS)
    expect(subject).toBe('Tu reserva de "Caminata a Los Pinos" fue cancelada')
    expect(html).toContain('No se realizó ningún cobro')
    expect(html).toContain('https://wa.me/573217203264')
  })
})

describe('sendGuideTourBookingCancelledEmail', () => {
  it('sends with the right recipient and subject', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    await sendGuideTourBookingCancelledEmail('turista@example.com', GUIDE_TOUR_CANCELLED_PARAMS)
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'turista@example.com', subject: 'Tu reserva de "Caminata a Los Pinos" fue cancelada' }),
    )
  })

  it('does not throw when Resend rejects the send', async () => {
    sendMock.mockRejectedValue(new Error('network error'))
    await expect(sendGuideTourBookingCancelledEmail('turista@example.com', GUIDE_TOUR_CANCELLED_PARAMS)).resolves.toBeUndefined()
  })
})

const TRANSPORTER_ROUTE_REQUEST_PENDING_PARAMS = {
  routeLabel: 'Manaure → Valledupar',
  touristName: 'Ana Pérez',
  requestedDatetime: '2026-09-05T14:30:00Z',
  peopleCount: 2,
}

describe('transporterRouteRequestPendingEmail', () => {
  it('includes the route label, tourist, people count, and a link to the panel — never claims the ride is confirmed', () => {
    const { subject, html } = transporterRouteRequestPendingEmail(TRANSPORTER_ROUTE_REQUEST_PENDING_PARAMS)
    expect(subject).toBe('Nueva solicitud de traslado pendiente')
    expect(html).toContain('Manaure → Valledupar')
    expect(html).toContain('Ana Pérez')
    expect(html).toContain('Personas:</strong> 2')
    expect(html).toContain('https://mantur.co/mi-perfil-transporte')
    expect(html).not.toContain('confirmado')
  })
})

describe('sendTransporterRouteRequestPendingEmail', () => {
  it('sends with the right recipient and subject', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    await sendTransporterRouteRequestPendingEmail('transportador@example.com', TRANSPORTER_ROUTE_REQUEST_PENDING_PARAMS)
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'transportador@example.com', subject: 'Nueva solicitud de traslado pendiente' }),
    )
  })

  it('does not throw when Resend rejects the send', async () => {
    sendMock.mockRejectedValue(new Error('network error'))
    await expect(sendTransporterRouteRequestPendingEmail('transportador@example.com', TRANSPORTER_ROUTE_REQUEST_PENDING_PARAMS)).resolves.toBeUndefined()
  })
})
