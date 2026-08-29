import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const redirectMock = vi.fn((url: string) => {
  throw new Error(`redirect:${url}`)
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
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: profileSingle }) }) }
      }
      throw new Error(`unexpected table on user client: ${table}`)
    },
  })),
}))

const bookingSingle = vi.fn()
const transactionSingle = vi.fn()
const refundInsertSingle = vi.fn()
const refundInsertMock = vi.fn((_payload: Record<string, unknown>) => ({ select: () => ({ single: refundInsertSingle }) }))
const percentageRpcMock = vi.fn()
const claimRpcMock = vi.fn()
const cascadeRpcMock = vi.fn()
const revertRpcMock = vi.fn()

const rpcMock = vi.fn((fn: string, args: Record<string, unknown>) => {
  if (fn === 'get_refund_percentage') return percentageRpcMock(args)
  if (fn === 'claim_refund_request_for_void') return claimRpcMock(args)
  if (fn === 'cascade_refund_to_booking') return cascadeRpcMock(args)
  if (fn === 'revert_refund_request_void_claim') return revertRpcMock(args)
  throw new Error(`unexpected rpc: ${fn}`)
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    rpc: rpcMock,
    from: (table: string) => {
      if (table === 'bookings') return { select: () => ({ eq: () => ({ single: bookingSingle }) }) }
      if (table === 'transactions') return { select: () => ({ eq: () => ({ single: transactionSingle }) }) }
      if (table === 'refund_requests') return { insert: refundInsertMock }
      throw new Error(`unexpected table on admin client: ${table}`)
    },
  })),
}))

const checkRateLimitMock = vi.fn()
vi.mock('@/lib/rate-limit', () => ({
  refundRequestRateLimit: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}))

const voidWompiTransactionMock = vi.fn()
vi.mock('@/lib/wompi/refunds', () => ({
  voidWompiTransaction: (...args: unknown[]) => voidWompiTransactionMock(...args),
}))

const sendRefundProcessedEmailMock = vi.fn()
vi.mock('@/lib/email/refundEmails', () => ({
  sendRefundProcessedEmail: (...args: unknown[]) => sendRefundProcessedEmailMock(...args),
}))

const { requestRefund } = await import('./actions')

function formData(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const BOOKING_ID = '11111111-1111-1111-1111-111111111111'
const USER_ID = 'user-1'

// "Today" for these tests is treated as 2026-08-31 — booking_date/created_at
// fixtures below are chosen relative to that.
const TODAY_ISO = '2026-08-31T12:00:00.000Z'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(TODAY_ISO))
  authGetUser.mockResolvedValue({ data: { user: { id: USER_ID, email: 'tourist@example.com' } } })
  profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
  checkRateLimitMock.mockResolvedValue(true)
  // Safe defaults for tests that aren't specifically exercising the void
  // path but happen to hit its trigger conditions (100% + charged today)
  // anyway — claim resolves false so nothing beyond the claim attempt runs.
  claimRpcMock.mockResolvedValue({ data: false, error: null })
  voidWompiTransactionMock.mockResolvedValue({ ok: false, error: 'not relevant to this test' })
})

afterEach(() => {
  vi.useRealTimers()
})

function bookingRow(overrides: Partial<{ status: string; booking_date: string; tourist_id: string }> = {}) {
  return {
    id: BOOKING_ID,
    tourist_id: overrides.tourist_id ?? USER_ID,
    booking_date: overrides.booking_date ?? '2026-09-10', // far out -> 100% tier
    status: overrides.status ?? 'confirmed',
  }
}

function transactionRow(overrides: Partial<{
  status: string
  amount_in_cents: number
  wompi_reference: string | null
  created_at: string
}> = {}) {
  return {
    id: 'tx-1',
    status: overrides.status ?? 'paid',
    amount_in_cents: overrides.amount_in_cents ?? 100000,
    wompi_reference: 'wompi_reference' in overrides ? overrides.wompi_reference : 'wompi-tx-1',
    created_at: overrides.created_at ?? TODAY_ISO,
  }
}

describe('rate limiting and auth guards', () => {
  it('returns a rate-limit error and never queries the booking when the limit is exceeded', async () => {
    checkRateLimitMock.mockResolvedValue(false)
    const result = await requestRefund(formData({ booking_id: BOOKING_ID }))
    expect(result).toEqual({ error: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.' })
    expect(bookingSingle).not.toHaveBeenCalled()
  })

  it('redirects to /login when there is no authenticated user', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    await expect(requestRefund(formData({ booking_id: BOOKING_ID }))).rejects.toThrow('redirect:/login')
  })

  it('redirects to / when the authenticated user is not a tourist', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'admin' } })
    await expect(requestRefund(formData({ booking_id: BOOKING_ID }))).rejects.toThrow('redirect:/')
  })
})

describe('validation', () => {
  it('rejects a non-UUID booking id without querying the DB', async () => {
    const result = await requestRefund(formData({ booking_id: 'not-a-uuid' }))
    expect(result).toEqual({ error: 'No se encontró el servicio o tour seleccionado.' })
    expect(bookingSingle).not.toHaveBeenCalled()
  })

  it('rejects when the booking does not exist', async () => {
    bookingSingle.mockResolvedValue({ data: null })
    const result = await requestRefund(formData({ booking_id: BOOKING_ID }))
    expect(result).toEqual({ error: 'No se encontró el servicio o tour seleccionado.' })
  })

  it("rejects when the booking belongs to a different tourist (never trusts a client-supplied booking id blindly)", async () => {
    bookingSingle.mockResolvedValue({ data: bookingRow({ tourist_id: 'someone-else' }) })
    const result = await requestRefund(formData({ booking_id: BOOKING_ID }))
    expect(result).toEqual({ error: 'No se encontró el servicio o tour seleccionado.' })
  })

  it('rejects a booking that is not confirmed (e.g. still pending_payment)', async () => {
    bookingSingle.mockResolvedValue({ data: bookingRow({ status: 'pending_payment' }) })
    const result = await requestRefund(formData({ booking_id: BOOKING_ID }))
    expect(result).toEqual({ error: 'Esta reserva no se puede reembolsar en su estado actual.' })
  })

  it('rejects a booking that is already cancelled', async () => {
    bookingSingle.mockResolvedValue({ data: bookingRow({ status: 'cancelled' }) })
    const result = await requestRefund(formData({ booking_id: BOOKING_ID }))
    expect(result).toEqual({ error: 'Esta reserva no se puede reembolsar en su estado actual.' })
  })

  it('rejects when the transaction is missing or not paid', async () => {
    bookingSingle.mockResolvedValue({ data: bookingRow() })
    transactionSingle.mockResolvedValue({ data: transactionRow({ status: 'pending' }) })
    const result = await requestRefund(formData({ booking_id: BOOKING_ID }))
    expect(result).toEqual({ error: 'Esta reserva no se puede reembolsar en su estado actual.' })
  })

  it('returns a generic error when the refund-percentage RPC fails', async () => {
    bookingSingle.mockResolvedValue({ data: bookingRow() })
    transactionSingle.mockResolvedValue({ data: transactionRow() })
    percentageRpcMock.mockResolvedValue({ data: null, error: { message: 'rpc failed' } })

    const result = await requestRefund(formData({ booking_id: BOOKING_ID }))
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(refundInsertMock).not.toHaveBeenCalled()
  })

  it('maps a unique_violation on insert to "already requested" rather than a generic error', async () => {
    bookingSingle.mockResolvedValue({ data: bookingRow() })
    transactionSingle.mockResolvedValue({ data: transactionRow() })
    percentageRpcMock.mockResolvedValue({ data: 100, error: null })
    refundInsertSingle.mockResolvedValue({ data: null, error: { code: '23505' } })

    const result = await requestRefund(formData({ booking_id: BOOKING_ID }))
    expect(result).toEqual({ error: 'Ya existe una solicitud de reembolso para esta reserva.' })
  })
})

describe('percentage/amount computation and RPC wiring', () => {
  it('calls get_refund_percentage with 240 hours for a booking 10 days out (far outside the same-day window)', async () => {
    bookingSingle.mockResolvedValue({ data: bookingRow({ booking_date: '2026-09-10' }) })
    transactionSingle.mockResolvedValue({ data: transactionRow({ amount_in_cents: 100000 }) })
    percentageRpcMock.mockResolvedValue({ data: 100, error: null })
    refundInsertSingle.mockResolvedValue({ data: { id: 'refund-1' }, error: null })

    await requestRefund(formData({ booking_id: BOOKING_ID }))

    expect(percentageRpcMock).toHaveBeenCalledWith({ p_hours_until_booking: 240 })
  })

  it('stores refund_amount_cents computed from the transaction amount and the returned percentage', async () => {
    bookingSingle.mockResolvedValue({ data: bookingRow() })
    transactionSingle.mockResolvedValue({ data: transactionRow({ amount_in_cents: 100000 }) })
    percentageRpcMock.mockResolvedValue({ data: 50, error: null })
    refundInsertSingle.mockResolvedValue({ data: { id: 'refund-1' }, error: null })

    await requestRefund(formData({ booking_id: BOOKING_ID }))

    const insertPayload = refundInsertMock.mock.calls[0][0]
    expect(insertPayload).toMatchObject({
      booking_id: BOOKING_ID,
      transaction_id: 'tx-1',
      requested_by: USER_ID,
      refund_percentage: 50,
      refund_amount_cents: 50000,
    })
  })

  it('stores a trimmed reason, or null when none is provided', async () => {
    bookingSingle.mockResolvedValue({ data: bookingRow() })
    transactionSingle.mockResolvedValue({ data: transactionRow() })
    percentageRpcMock.mockResolvedValue({ data: 100, error: null })
    refundInsertSingle.mockResolvedValue({ data: { id: 'refund-1' }, error: null })

    await requestRefund(formData({ booking_id: BOOKING_ID, reason: '  Cambio de planes  ' }))
    expect(refundInsertMock.mock.calls[0][0]).toMatchObject({ reason: 'Cambio de planes' })

    await requestRefund(formData({ booking_id: BOOKING_ID }))
    expect(refundInsertMock.mock.calls[1][0]).toMatchObject({ reason: null })
  })
})

describe('same-day 100% refund → automatic Wompi void', () => {
  it('claims the row, attempts a void, cascades the booking/transaction, and emails the tourist', async () => {
    bookingSingle.mockResolvedValue({ data: bookingRow({ booking_date: '2026-09-10' }) })
    transactionSingle.mockResolvedValue({ data: transactionRow({ created_at: TODAY_ISO, wompi_reference: 'wompi-tx-99' }) })
    percentageRpcMock.mockResolvedValue({ data: 100, error: null })
    refundInsertSingle.mockResolvedValue({ data: { id: 'refund-1' }, error: null })
    claimRpcMock.mockResolvedValue({ data: true, error: null })
    voidWompiTransactionMock.mockResolvedValue({ ok: true })
    cascadeRpcMock.mockResolvedValue({ data: null, error: null })

    await requestRefund(formData({ booking_id: BOOKING_ID }))

    expect(claimRpcMock).toHaveBeenCalledWith({ p_refund_request_id: 'refund-1' })
    expect(voidWompiTransactionMock).toHaveBeenCalledWith('wompi-tx-99')
    expect(cascadeRpcMock).toHaveBeenCalledWith({ p_refund_request_id: 'refund-1' })
    expect(revertRpcMock).not.toHaveBeenCalled()
    expect(sendRefundProcessedEmailMock).toHaveBeenCalledWith('tourist@example.com', 100000, 'void')
    expect(revalidatePathMock).toHaveBeenCalledWith('/mis-reservas')
  })

  it('does not call Wompi or cascade when an admin action wins the claim race first (claim returns false)', async () => {
    bookingSingle.mockResolvedValue({ data: bookingRow({ booking_date: '2026-09-10' }) })
    transactionSingle.mockResolvedValue({ data: transactionRow({ created_at: TODAY_ISO }) })
    percentageRpcMock.mockResolvedValue({ data: 100, error: null })
    refundInsertSingle.mockResolvedValue({ data: { id: 'refund-1' }, error: null })
    claimRpcMock.mockResolvedValue({ data: false, error: null })

    await requestRefund(formData({ booking_id: BOOKING_ID }))

    expect(voidWompiTransactionMock).not.toHaveBeenCalled()
    expect(cascadeRpcMock).not.toHaveBeenCalled()
    expect(revertRpcMock).not.toHaveBeenCalled()
  })

  it('does not attempt a void when the refund percentage is below 100%, even if charged today', async () => {
    bookingSingle.mockResolvedValue({ data: bookingRow({ booking_date: '2026-09-01' }) }) // ~24h -> 50%
    transactionSingle.mockResolvedValue({ data: transactionRow({ created_at: TODAY_ISO }) })
    percentageRpcMock.mockResolvedValue({ data: 50, error: null })
    refundInsertSingle.mockResolvedValue({ data: { id: 'refund-1' }, error: null })

    await requestRefund(formData({ booking_id: BOOKING_ID }))

    expect(voidWompiTransactionMock).not.toHaveBeenCalled()
  })

  it('does not attempt a void when the charge happened on an earlier day, even at 100%', async () => {
    bookingSingle.mockResolvedValue({ data: bookingRow({ booking_date: '2026-09-10' }) })
    transactionSingle.mockResolvedValue({ data: transactionRow({ created_at: '2026-08-25T12:00:00.000Z' }) })
    percentageRpcMock.mockResolvedValue({ data: 100, error: null })
    refundInsertSingle.mockResolvedValue({ data: { id: 'refund-1' }, error: null })

    await requestRefund(formData({ booking_id: BOOKING_ID }))

    expect(voidWompiTransactionMock).not.toHaveBeenCalled()
  })

  it('does not attempt a void when the transaction has no wompi_reference yet', async () => {
    bookingSingle.mockResolvedValue({ data: bookingRow({ booking_date: '2026-09-10' }) })
    transactionSingle.mockResolvedValue({ data: transactionRow({ created_at: TODAY_ISO, wompi_reference: null }) })
    percentageRpcMock.mockResolvedValue({ data: 100, error: null })
    refundInsertSingle.mockResolvedValue({ data: { id: 'refund-1' }, error: null })

    await requestRefund(formData({ booking_id: BOOKING_ID }))

    expect(voidWompiTransactionMock).not.toHaveBeenCalled()
  })

  it('reverts the claim (no error surfaced to the tourist, no cascade, no email) when the void call fails — an admin can still process it manually', async () => {
    bookingSingle.mockResolvedValue({ data: bookingRow({ booking_date: '2026-09-10' }) })
    transactionSingle.mockResolvedValue({ data: transactionRow({ created_at: TODAY_ISO }) })
    percentageRpcMock.mockResolvedValue({ data: 100, error: null })
    refundInsertSingle.mockResolvedValue({ data: { id: 'refund-1' }, error: null })
    claimRpcMock.mockResolvedValue({ data: true, error: null })
    voidWompiTransactionMock.mockResolvedValue({ ok: false, error: 'past void window' })

    const result = await requestRefund(formData({ booking_id: BOOKING_ID }))

    expect(result).toBeUndefined()
    expect(revertRpcMock).toHaveBeenCalledWith({ p_refund_request_id: 'refund-1' })
    expect(cascadeRpcMock).not.toHaveBeenCalled()
    expect(sendRefundProcessedEmailMock).not.toHaveBeenCalled()
  })
})
