import { describe, it, expect, vi, beforeEach } from 'vitest'

// Isolated test file (rather than adding to the large shared
// admin/actions.test.ts mock switch) for updateWompiBankId specifically —
// it only ever touches business_payout_accounts/tourist_guide_payout_accounts,
// which nothing else in that shared file's mocks currently models.

class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`redirect:${url}`)
  }
}

const redirectMock = vi.fn((url: string) => {
  throw new RedirectSignal(url)
})
const revalidatePathMock = vi.fn()

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

const authGetUser = vi.fn()
const profileSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: authGetUser },
    from: (table: string) => {
      if (table === 'profiles') return { select: () => ({ eq: () => ({ single: profileSingle }) }) }
      throw new Error(`unexpected table on user client: ${table}`)
    },
  })),
}))

const updateSelect = vi.fn()
const updateMock = vi.fn(() => ({ eq: () => ({ select: updateSelect }) }))
const fromMock = vi.fn((table: string) => {
  if (table === 'business_payout_accounts' || table === 'tourist_guide_payout_accounts') {
    return { update: updateMock }
  }
  throw new Error(`unexpected table on admin client: ${table}`)
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
}))

const { updateWompiBankId } = await import('./actions')

function formData(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const RECIPIENT_ID = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  profileSingle.mockResolvedValue({ data: { role: 'admin' } })
})

describe('updateWompiBankId', () => {
  it('returns a generic error for an invalid recipientType', async () => {
    const result = await updateWompiBankId(formData({ recipientType: 'other', recipientId: RECIPIENT_ID, wompiBankId: 'bank-1' }))
    expect(result).toEqual({ error: 'Error al guardar. Intenta de nuevo.' })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('returns a not-found error for a non-UUID recipientId', async () => {
    const result = await updateWompiBankId(formData({ recipientType: 'business', recipientId: 'bad', wompiBankId: 'bank-1' }))
    expect(result).toEqual({ error: 'El destinatario aún no ha registrado su cuenta bancaria.' })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('returns an invalid-value error for an empty wompiBankId', async () => {
    const result = await updateWompiBankId(formData({ recipientType: 'business', recipientId: RECIPIENT_ID, wompiBankId: '  ' }))
    expect(result).toEqual({ error: 'Escribe un ID de banco válido.' })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('updates business_payout_accounts by business_id for recipientType=business', async () => {
    updateSelect.mockResolvedValue({ data: [{ business_id: RECIPIENT_ID }], error: null })

    const result = await updateWompiBankId(formData({ recipientType: 'business', recipientId: RECIPIENT_ID, wompiBankId: 'bank-uuid-1' }))

    expect(fromMock).toHaveBeenCalledWith('business_payout_accounts')
    expect(updateMock).toHaveBeenCalledWith({ wompi_bank_id: 'bank-uuid-1' })
    expect(result).toEqual({ success: true })
  })

  it('updates tourist_guide_payout_accounts by guide_id for recipientType=guide', async () => {
    updateSelect.mockResolvedValue({ data: [{ guide_id: RECIPIENT_ID }], error: null })

    const result = await updateWompiBankId(formData({ recipientType: 'guide', recipientId: RECIPIENT_ID, wompiBankId: 'bank-uuid-2' }))

    expect(fromMock).toHaveBeenCalledWith('tourist_guide_payout_accounts')
    expect(result).toEqual({ success: true })
  })

  it('returns a not-found error when the recipient has not saved their own bank details yet (no row to update)', async () => {
    updateSelect.mockResolvedValue({ data: [], error: null })

    const result = await updateWompiBankId(formData({ recipientType: 'business', recipientId: RECIPIENT_ID, wompiBankId: 'bank-uuid-1' }))

    expect(result).toEqual({ error: 'El destinatario aún no ha registrado su cuenta bancaria.' })
  })

  it('returns a generic error when the update itself fails', async () => {
    updateSelect.mockResolvedValue({ data: null, error: { message: 'db error' } })

    const result = await updateWompiBankId(formData({ recipientType: 'business', recipientId: RECIPIENT_ID, wompiBankId: 'bank-uuid-1' }))

    expect(result).toEqual({ error: 'Error al guardar. Intenta de nuevo.' })
  })

  it('redirects to /login when unauthenticated', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    await expect(
      updateWompiBankId(formData({ recipientType: 'business', recipientId: RECIPIENT_ID, wompiBankId: 'bank-1' })),
    ).rejects.toThrow('redirect:/login')
  })

  it('redirects to / when the user is not an admin', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    await expect(
      updateWompiBankId(formData({ recipientType: 'business', recipientId: RECIPIENT_ID, wompiBankId: 'bank-1' })),
    ).rejects.toThrow('redirect:/')
    expect(fromMock).not.toHaveBeenCalled()
  })
})
