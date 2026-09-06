import { describe, it, expect, vi, beforeEach } from 'vitest'

const resolvePackageProvidersMock = vi.fn()
vi.mock('@/lib/packages/providers', () => ({
  resolvePackageProviders: (...args: unknown[]) => resolvePackageProvidersMock(...args),
}))

const sendConfirmedMock = vi.fn()
const sendCancelledMock = vi.fn()
const sendPayoutSentMock = vi.fn()
vi.mock('./bookingEmails', () => ({
  sendPackageProvidersConfirmedEmail: (...args: unknown[]) => sendConfirmedMock(...args),
  sendPackageProvidersCancelledEmail: (...args: unknown[]) => sendCancelledMock(...args),
  sendPackageProvidersPayoutSentEmail: (...args: unknown[]) => sendPayoutSentMock(...args),
}))

const {
  notifyPackageProvidersOfConfirmation,
  notifyPackageProvidersOfCancellation,
  notifyPackageProvidersOfPayout,
} = await import('./packageProviderNotifications')

const BOOKING_ID = 'booking-1'
const PARAMS = { bookingId: BOOKING_ID, packageName: 'Ruta Serranía del Perijá', bookingDate: '2026-09-05' }

function makeAdmin(options: {
  packageId?: string | null
  business?: { owner_id: string } | null
  guide?: { profile_id: string } | null
  email?: string | null
}) {
  const bookingSingle = vi.fn().mockResolvedValue({ data: { package_id: options.packageId ?? null } })
  const businessSingle = vi.fn().mockResolvedValue({ data: options.business ?? null })
  const guideSingle = vi.fn().mockResolvedValue({ data: options.guide ?? null })
  const getUserById = vi.fn().mockResolvedValue({ data: { user: options.email ? { email: options.email } : null } })

  return {
    from: (table: string) => {
      if (table === 'bookings') return { select: () => ({ eq: () => ({ single: bookingSingle }) }) }
      if (table === 'businesses') return { select: () => ({ eq: () => ({ single: businessSingle }) }) }
      if (table === 'tourist_guides') return { select: () => ({ eq: () => ({ single: guideSingle }) }) }
      throw new Error(`unexpected table: ${table}`)
    },
    auth: { admin: { getUserById } },
  } as unknown as Parameters<typeof notifyPackageProvidersOfConfirmation>[0]
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('notifyPackageProvidersOfConfirmation', () => {
  it('does nothing when the booking has no package_id', async () => {
    const admin = makeAdmin({ packageId: null })
    await notifyPackageProvidersOfConfirmation(admin, PARAMS)
    expect(resolvePackageProvidersMock).not.toHaveBeenCalled()
  })

  it('emails a resolved business owner with the /mi-negocio panel link', async () => {
    const admin = makeAdmin({ packageId: 'package-1', business: { owner_id: 'owner-1' }, email: 'negocio@example.com' })
    resolvePackageProvidersMock.mockResolvedValue([{ recipientType: 'business', recipientId: 'biz-1', amountCents: 5000 }])

    await notifyPackageProvidersOfConfirmation(admin, PARAMS)

    expect(sendConfirmedMock).toHaveBeenCalledWith('negocio@example.com', {
      packageName: PARAMS.packageName,
      bookingDate: PARAMS.bookingDate,
      panelUrl: 'https://mantur.co/mi-negocio',
    })
  })

  it('emails a resolved guide with the /mi-perfil-guia panel link', async () => {
    const admin = makeAdmin({ packageId: 'package-1', guide: { profile_id: 'profile-1' }, email: 'guia@example.com' })
    resolvePackageProvidersMock.mockResolvedValue([{ recipientType: 'guide', recipientId: 'guide-1', amountCents: 5000 }])

    await notifyPackageProvidersOfConfirmation(admin, PARAMS)

    expect(sendConfirmedMock).toHaveBeenCalledWith('guia@example.com', {
      packageName: PARAMS.packageName,
      bookingDate: PARAMS.bookingDate,
      panelUrl: 'https://mantur.co/mi-perfil-guia',
    })
  })

  it('dedupes multiple package_items from the same provider into one email (via resolvePackageProviders)', async () => {
    const admin = makeAdmin({ packageId: 'package-1', business: { owner_id: 'owner-1' }, email: 'negocio@example.com' })
    resolvePackageProvidersMock.mockResolvedValue([{ recipientType: 'business', recipientId: 'biz-1', amountCents: 8000 }])

    await notifyPackageProvidersOfConfirmation(admin, PARAMS)

    expect(sendConfirmedMock).toHaveBeenCalledTimes(1)
  })

  it('skips a provider with no resolvable email, without throwing', async () => {
    const admin = makeAdmin({ packageId: 'package-1', business: { owner_id: 'owner-1' }, email: null })
    resolvePackageProvidersMock.mockResolvedValue([{ recipientType: 'business', recipientId: 'biz-1', amountCents: 5000 }])

    await expect(notifyPackageProvidersOfConfirmation(admin, PARAMS)).resolves.toBeUndefined()
    expect(sendConfirmedMock).not.toHaveBeenCalled()
  })

  it('never throws on an unexpected error', async () => {
    const admin = {
      from: () => {
        throw new Error('boom')
      },
    } as unknown as Parameters<typeof notifyPackageProvidersOfConfirmation>[0]
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(notifyPackageProvidersOfConfirmation(admin, PARAMS)).resolves.toBeUndefined()

    errorSpy.mockRestore()
  })

  it('still notifies the second provider when resolving the first one throws', async () => {
    const bookingSingle = vi.fn().mockResolvedValue({ data: { package_id: 'package-1' } })
    const businessSingle = vi.fn().mockRejectedValue(new Error('db blip'))
    const guideSingle = vi.fn().mockResolvedValue({ data: { profile_id: 'profile-1' } })
    const getUserById = vi.fn().mockResolvedValue({ data: { user: { email: 'guia@example.com' } } })
    const admin = {
      from: (table: string) => {
        if (table === 'bookings') return { select: () => ({ eq: () => ({ single: bookingSingle }) }) }
        if (table === 'businesses') return { select: () => ({ eq: () => ({ single: businessSingle }) }) }
        if (table === 'tourist_guides') return { select: () => ({ eq: () => ({ single: guideSingle }) }) }
        throw new Error(`unexpected table: ${table}`)
      },
      auth: { admin: { getUserById } },
    } as unknown as Parameters<typeof notifyPackageProvidersOfConfirmation>[0]

    resolvePackageProvidersMock.mockResolvedValue([
      { recipientType: 'business', recipientId: 'biz-1', amountCents: 5000 },
      { recipientType: 'guide', recipientId: 'guide-1', amountCents: 3000 },
    ])
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await notifyPackageProvidersOfConfirmation(admin, PARAMS)

    expect(sendConfirmedMock).toHaveBeenCalledTimes(1)
    expect(sendConfirmedMock).toHaveBeenCalledWith('guia@example.com', expect.objectContaining({ panelUrl: 'https://mantur.co/mi-perfil-guia' }))
    errorSpy.mockRestore()
  })
})

describe('notifyPackageProvidersOfCancellation', () => {
  it('emails each resolved provider via sendPackageProvidersCancelledEmail', async () => {
    const admin = makeAdmin({ packageId: 'package-1', business: { owner_id: 'owner-1' }, email: 'negocio@example.com' })
    resolvePackageProvidersMock.mockResolvedValue([{ recipientType: 'business', recipientId: 'biz-1', amountCents: 5000 }])

    await notifyPackageProvidersOfCancellation(admin, PARAMS)

    expect(sendCancelledMock).toHaveBeenCalledWith('negocio@example.com', {
      packageName: PARAMS.packageName,
      bookingDate: PARAMS.bookingDate,
      panelUrl: 'https://mantur.co/mi-negocio',
    })
  })
})

describe('notifyPackageProvidersOfPayout', () => {
  it('emails each resolved provider via sendPackageProvidersPayoutSentEmail, including their own amountCents', async () => {
    const admin = makeAdmin({ packageId: 'package-1', guide: { profile_id: 'profile-1' }, email: 'guia@example.com' })
    resolvePackageProvidersMock.mockResolvedValue([{ recipientType: 'guide', recipientId: 'guide-1', amountCents: 12000 }])

    await notifyPackageProvidersOfPayout(admin, PARAMS)

    expect(sendPayoutSentMock).toHaveBeenCalledWith('guia@example.com', {
      packageName: PARAMS.packageName,
      bookingDate: PARAMS.bookingDate,
      amountCents: 12000,
      panelUrl: 'https://mantur.co/mi-perfil-guia',
    })
  })
})
