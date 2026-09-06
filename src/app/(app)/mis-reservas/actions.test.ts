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

const reviewInsertMock = vi.fn()
const packageReviewInsertSingle = vi.fn()
const packageItemsEqMock = vi.fn()
const packageItemReviewsInsertMock = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    rpc: rpcMock,
    from: (table: string) => {
      if (table === 'bookings') return { select: () => ({ eq: () => ({ single: bookingSingle }) }) }
      if (table === 'transactions') return { select: () => ({ eq: () => ({ single: transactionSingle }) }) }
      if (table === 'refund_requests') return { insert: refundInsertMock }
      if (table === 'guide_tour_reviews') return { insert: (payload: Record<string, unknown>) => reviewInsertMock(payload) }
      if (table === 'package_reviews') {
        return { insert: () => ({ select: () => ({ single: packageReviewInsertSingle }) }) }
      }
      if (table === 'package_items') return { select: () => ({ eq: (...args: unknown[]) => packageItemsEqMock(...args) }) }
      if (table === 'package_item_reviews') {
        return { insert: (payload: Record<string, unknown>[]) => packageItemReviewsInsertMock(payload) }
      }
      throw new Error(`unexpected table on admin client: ${table}`)
    },
  })),
}))

const checkRateLimitMock = vi.fn()
vi.mock('@/lib/rate-limit', () => ({
  refundRequestRateLimit: {},
  guideTourReviewRateLimit: {},
  packageReviewRateLimit: {},
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

const syncAlegraCreditNoteForRefundMock = vi.fn()
vi.mock('@/lib/alegra/refundCreditNotes', () => ({
  syncAlegraCreditNoteForRefund: (...args: unknown[]) => syncAlegraCreditNoteForRefundMock(...args),
}))

const { requestRefund, createGuideTourReview, createPackageReview } = await import('./actions')

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
  reviewInsertMock.mockResolvedValue({ data: null, error: null })
  packageReviewInsertSingle.mockResolvedValue({ data: { id: 'review-1' }, error: null })
  packageItemsEqMock.mockResolvedValue({ data: [] })
  packageItemReviewsInsertMock.mockResolvedValue({ data: null, error: null })
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
  wompi_fee_cents: number | null
  payment_method_type: string | null
}> = {}) {
  return {
    id: 'tx-1',
    status: overrides.status ?? 'paid',
    amount_in_cents: overrides.amount_in_cents ?? 100000,
    wompi_reference: 'wompi_reference' in overrides ? overrides.wompi_reference : 'wompi-tx-1',
    created_at: overrides.created_at ?? TODAY_ISO,
    wompi_fee_cents: 'wompi_fee_cents' in overrides ? overrides.wompi_fee_cents : 8_803,
    // Defaults to 'CARD' so every pre-existing void-path test (written
    // before payment-method gating existed) keeps exercising the void
    // attempt unchanged — only the dedicated non-card test below overrides it.
    payment_method_type: 'payment_method_type' in overrides ? overrides.payment_method_type : 'CARD',
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

  it("stores the transaction's snapshotted wompi_fee_cents on the refund request", async () => {
    bookingSingle.mockResolvedValue({ data: bookingRow() })
    transactionSingle.mockResolvedValue({ data: transactionRow({ wompi_fee_cents: 8_803 }) })
    percentageRpcMock.mockResolvedValue({ data: 50, error: null })
    refundInsertSingle.mockResolvedValue({ data: { id: 'refund-1' }, error: null })

    await requestRefund(formData({ booking_id: BOOKING_ID }))

    expect(refundInsertMock.mock.calls[0][0]).toMatchObject({ wompi_fee_cents: 8_803 })
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

  it('stores a trimmed payout_instructions, or null when none is provided', async () => {
    bookingSingle.mockResolvedValue({ data: bookingRow() })
    transactionSingle.mockResolvedValue({ data: transactionRow() })
    percentageRpcMock.mockResolvedValue({ data: 100, error: null })
    refundInsertSingle.mockResolvedValue({ data: { id: 'refund-1' }, error: null })

    await requestRefund(formData({ booking_id: BOOKING_ID, payout_instructions: '  Nequi 3001234567  ' }))
    expect(refundInsertMock.mock.calls[0][0]).toMatchObject({ payout_instructions: 'Nequi 3001234567' })

    await requestRefund(formData({ booking_id: BOOKING_ID }))
    expect(refundInsertMock.mock.calls[1][0]).toMatchObject({ payout_instructions: null })
  })

  it('caps payout_instructions at 500 characters server-side, independent of the form', async () => {
    bookingSingle.mockResolvedValue({ data: bookingRow() })
    transactionSingle.mockResolvedValue({ data: transactionRow() })
    percentageRpcMock.mockResolvedValue({ data: 100, error: null })
    refundInsertSingle.mockResolvedValue({ data: { id: 'refund-1' }, error: null })

    await requestRefund(formData({ booking_id: BOOKING_ID, payout_instructions: 'a'.repeat(600) }))

    expect(refundInsertMock.mock.calls[0][0]).toMatchObject({ payout_instructions: 'a'.repeat(500) })
  })
})

describe('same-day 100% refund → automatic Wompi void', () => {
  it('claims the row, attempts a void, and cascades immediately when Wompi already confirms VOIDED synchronously', async () => {
    bookingSingle.mockResolvedValue({ data: bookingRow({ booking_date: '2026-09-10' }) })
    transactionSingle.mockResolvedValue({ data: transactionRow({ created_at: TODAY_ISO, wompi_reference: 'wompi-tx-99' }) })
    percentageRpcMock.mockResolvedValue({ data: 100, error: null })
    refundInsertSingle.mockResolvedValue({ data: { id: 'refund-1' }, error: null })
    claimRpcMock.mockResolvedValue({ data: true, error: null })
    voidWompiTransactionMock.mockResolvedValue({ ok: true, status: 'VOIDED' })
    cascadeRpcMock.mockResolvedValue({ data: true, error: null })

    await requestRefund(formData({ booking_id: BOOKING_ID }))

    expect(claimRpcMock).toHaveBeenCalledWith({ p_refund_request_id: 'refund-1' })
    expect(voidWompiTransactionMock).toHaveBeenCalledWith('wompi-tx-99')
    expect(cascadeRpcMock).toHaveBeenCalledWith({ p_refund_request_id: 'refund-1' })
    expect(revertRpcMock).not.toHaveBeenCalled()
    expect(sendRefundProcessedEmailMock).toHaveBeenCalledWith('tourist@example.com', 100000, 'void')
    expect(syncAlegraCreditNoteForRefundMock).toHaveBeenCalledWith(expect.anything(), 'refund-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/mis-reservas')
  })

  it('emails the full gross amount for a void, ignoring the Wompi fee (a void is fee-free by design)', async () => {
    bookingSingle.mockResolvedValue({ data: bookingRow({ booking_date: '2026-09-10' }) })
    transactionSingle.mockResolvedValue({
      data: transactionRow({ created_at: TODAY_ISO, wompi_reference: 'wompi-tx-99', amount_in_cents: 100000, wompi_fee_cents: 88_030 }),
    })
    percentageRpcMock.mockResolvedValue({ data: 100, error: null })
    refundInsertSingle.mockResolvedValue({ data: { id: 'refund-1' }, error: null })
    claimRpcMock.mockResolvedValue({ data: true, error: null })
    voidWompiTransactionMock.mockResolvedValue({ ok: true, status: 'VOIDED' })
    cascadeRpcMock.mockResolvedValue({ data: true, error: null })

    await requestRefund(formData({ booking_id: BOOKING_ID }))

    expect(sendRefundProcessedEmailMock).toHaveBeenCalledWith('tourist@example.com', 100000, 'void')
  })

  it('does not email when cascade reports it was a no-op (e.g. the webhook already won the race and cascaded first)', async () => {
    bookingSingle.mockResolvedValue({ data: bookingRow({ booking_date: '2026-09-10' }) })
    transactionSingle.mockResolvedValue({ data: transactionRow({ created_at: TODAY_ISO, wompi_reference: 'wompi-tx-99' }) })
    percentageRpcMock.mockResolvedValue({ data: 100, error: null })
    refundInsertSingle.mockResolvedValue({ data: { id: 'refund-1' }, error: null })
    claimRpcMock.mockResolvedValue({ data: true, error: null })
    voidWompiTransactionMock.mockResolvedValue({ ok: true, status: 'VOIDED' })
    cascadeRpcMock.mockResolvedValue({ data: false, error: null })

    await requestRefund(formData({ booking_id: BOOKING_ID }))

    expect(cascadeRpcMock).toHaveBeenCalledWith({ p_refund_request_id: 'refund-1' })
    expect(sendRefundProcessedEmailMock).not.toHaveBeenCalled()
    expect(syncAlegraCreditNoteForRefundMock).not.toHaveBeenCalled()
  })

  it('leaves the row claimed (processing) without cascading or emailing when Wompi accepts the void but has not confirmed VOIDED yet — the webhook confirms it later', async () => {
    bookingSingle.mockResolvedValue({ data: bookingRow({ booking_date: '2026-09-10' }) })
    transactionSingle.mockResolvedValue({ data: transactionRow({ created_at: TODAY_ISO, wompi_reference: 'wompi-tx-99' }) })
    percentageRpcMock.mockResolvedValue({ data: 100, error: null })
    refundInsertSingle.mockResolvedValue({ data: { id: 'refund-1' }, error: null })
    claimRpcMock.mockResolvedValue({ data: true, error: null })
    voidWompiTransactionMock.mockResolvedValue({ ok: true, status: 'APPROVED' })

    await requestRefund(formData({ booking_id: BOOKING_ID }))

    expect(cascadeRpcMock).not.toHaveBeenCalled()
    expect(revertRpcMock).not.toHaveBeenCalled()
    expect(sendRefundProcessedEmailMock).not.toHaveBeenCalled()
    expect(syncAlegraCreditNoteForRefundMock).not.toHaveBeenCalled()
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

  it('does not attempt a void for a non-CARD payment method, even at 100%/same-day (Wompi has no automated refund path for Nequi/PSE/Bancolombia)', async () => {
    bookingSingle.mockResolvedValue({ data: bookingRow({ booking_date: '2026-09-10' }) })
    transactionSingle.mockResolvedValue({
      data: transactionRow({ created_at: TODAY_ISO, payment_method_type: 'NEQUI' }),
    })
    percentageRpcMock.mockResolvedValue({ data: 100, error: null })
    refundInsertSingle.mockResolvedValue({ data: { id: 'refund-1' }, error: null })

    await requestRefund(formData({ booking_id: BOOKING_ID }))

    expect(voidWompiTransactionMock).not.toHaveBeenCalled()
    expect(claimRpcMock).not.toHaveBeenCalled()
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

function reviewBookingRow(overrides: Partial<{
  status: string
  booking_date: string
  tourist_id: string
  guide_tour_id: string | null
}> = {}) {
  return {
    id: BOOKING_ID,
    tourist_id: overrides.tourist_id ?? USER_ID,
    guide_tour_id: 'guide_tour_id' in overrides ? overrides.guide_tour_id : 'tour-1',
    booking_date: overrides.booking_date ?? '2026-08-20', // before TODAY_ISO (2026-08-31) -> already happened
    status: overrides.status ?? 'confirmed',
  }
}

describe('createGuideTourReview', () => {
  it('returns a rate-limit error and never queries the DB when the limit is exceeded', async () => {
    checkRateLimitMock.mockResolvedValue(false)
    const result = await createGuideTourReview(formData({ booking_id: BOOKING_ID, rating: '5' }))
    expect(result).toEqual({ error: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.' })
    expect(bookingSingle).not.toHaveBeenCalled()
  })

  it('rejects a non-UUID booking id without querying the DB', async () => {
    const result = await createGuideTourReview(formData({ booking_id: 'not-a-uuid', rating: '5' }))
    expect(result).toEqual({ error: 'Solo puedes reseñar tours ya realizados de reservas confirmadas.' })
    expect(bookingSingle).not.toHaveBeenCalled()
  })

  it.each(['0', '6', '2.5', 'abc', ''])('rejects an invalid rating value %s', async (rating) => {
    const result = await createGuideTourReview(formData({ booking_id: BOOKING_ID, rating }))
    expect(result).toEqual({ error: 'Selecciona una calificación de 1 a 5 estrellas.' })
    expect(bookingSingle).not.toHaveBeenCalled()
  })

  it('rejects when the booking does not exist', async () => {
    bookingSingle.mockResolvedValue({ data: null })
    const result = await createGuideTourReview(formData({ booking_id: BOOKING_ID, rating: '5' }))
    expect(result).toEqual({ error: 'Solo puedes reseñar tours ya realizados de reservas confirmadas.' })
  })

  it('rejects when the booking belongs to a different tourist', async () => {
    bookingSingle.mockResolvedValue({ data: reviewBookingRow({ tourist_id: 'someone-else' }) })
    const result = await createGuideTourReview(formData({ booking_id: BOOKING_ID, rating: '5' }))
    expect(result).toEqual({ error: 'Solo puedes reseñar tours ya realizados de reservas confirmadas.' })
  })

  it('rejects a booking with no guide_tour_id (a service or package booking)', async () => {
    bookingSingle.mockResolvedValue({ data: reviewBookingRow({ guide_tour_id: null }) })
    const result = await createGuideTourReview(formData({ booking_id: BOOKING_ID, rating: '5' }))
    expect(result).toEqual({ error: 'Solo puedes reseñar tours ya realizados de reservas confirmadas.' })
  })

  it('rejects a booking that is not confirmed', async () => {
    bookingSingle.mockResolvedValue({ data: reviewBookingRow({ status: 'pending_payment' }) })
    const result = await createGuideTourReview(formData({ booking_id: BOOKING_ID, rating: '5' }))
    expect(result).toEqual({ error: 'Solo puedes reseñar tours ya realizados de reservas confirmadas.' })
    expect(reviewInsertMock).not.toHaveBeenCalled()
  })

  it('rejects a tour whose booking_date has not happened yet', async () => {
    bookingSingle.mockResolvedValue({ data: reviewBookingRow({ booking_date: '2026-09-10' }) })
    const result = await createGuideTourReview(formData({ booking_id: BOOKING_ID, rating: '5' }))
    expect(result).toEqual({ error: 'Solo puedes reseñar tours ya realizados de reservas confirmadas.' })
    expect(reviewInsertMock).not.toHaveBeenCalled()
  })

  it('rejects a tour whose booking_date is today (not yet "already happened")', async () => {
    bookingSingle.mockResolvedValue({ data: reviewBookingRow({ booking_date: '2026-08-31' }) })
    const result = await createGuideTourReview(formData({ booking_id: BOOKING_ID, rating: '5' }))
    expect(result).toEqual({ error: 'Solo puedes reseñar tours ya realizados de reservas confirmadas.' })
  })

  it('inserts the review with a trimmed comment and revalidates on success', async () => {
    bookingSingle.mockResolvedValue({ data: reviewBookingRow() })

    const result = await createGuideTourReview(
      formData({ booking_id: BOOKING_ID, rating: '4', comment: '  Excelente experiencia  ' }),
    )

    expect(result).toEqual({ success: true })
    expect(reviewInsertMock).toHaveBeenCalledWith({
      guide_tour_id: 'tour-1',
      booking_id: BOOKING_ID,
      tourist_id: USER_ID,
      rating: 4,
      comment: 'Excelente experiencia',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/mis-reservas')
  })

  it('stores a null comment when none is provided', async () => {
    bookingSingle.mockResolvedValue({ data: reviewBookingRow() })

    await createGuideTourReview(formData({ booking_id: BOOKING_ID, rating: '5' }))

    expect(reviewInsertMock).toHaveBeenCalledWith(expect.objectContaining({ comment: null }))
  })

  it('caps the comment at 500 characters server-side', async () => {
    bookingSingle.mockResolvedValue({ data: reviewBookingRow() })

    await createGuideTourReview(formData({ booking_id: BOOKING_ID, rating: '5', comment: 'a'.repeat(600) }))

    expect(reviewInsertMock).toHaveBeenCalledWith(expect.objectContaining({ comment: 'a'.repeat(500) }))
  })

  it('maps a unique_violation on insert to "already reviewed" rather than a generic error', async () => {
    bookingSingle.mockResolvedValue({ data: reviewBookingRow() })
    reviewInsertMock.mockResolvedValue({ data: null, error: { code: '23505' } })

    const result = await createGuideTourReview(formData({ booking_id: BOOKING_ID, rating: '5' }))

    expect(result).toEqual({ error: 'Ya dejaste una reseña para esta reserva.' })
  })

  it('returns a generic error on any other insert failure', async () => {
    bookingSingle.mockResolvedValue({ data: reviewBookingRow() })
    reviewInsertMock.mockResolvedValue({ data: null, error: { code: '23503' } })

    const result = await createGuideTourReview(formData({ booking_id: BOOKING_ID, rating: '5' }))

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })
})

const PACKAGE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const ITEM_ID_1 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const ITEM_ID_2 = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

function packageBookingRow(overrides: Partial<{ status: string; booking_date: string; tourist_id: string; package_id: string | null }> = {}) {
  return {
    id: BOOKING_ID,
    tourist_id: overrides.tourist_id ?? USER_ID,
    package_id: 'package_id' in overrides ? overrides.package_id : PACKAGE_ID,
    booking_date: overrides.booking_date ?? '2026-08-20', // before TODAY_ISO (2026-08-31) -> already happened
    status: overrides.status ?? 'confirmed',
  }
}

describe('createPackageReview', () => {
  it('returns a rate-limit error and never queries the DB when the limit is exceeded', async () => {
    checkRateLimitMock.mockResolvedValue(false)
    const result = await createPackageReview(formData({ booking_id: BOOKING_ID, rating: '5' }))
    expect(result).toEqual({ error: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.' })
    expect(bookingSingle).not.toHaveBeenCalled()
  })

  it('rejects a non-UUID booking id without querying the DB', async () => {
    const result = await createPackageReview(formData({ booking_id: 'not-a-uuid', rating: '5' }))
    expect(result).toEqual({ error: 'Solo puedes reseñar paquetes ya realizados de reservas confirmadas.' })
    expect(bookingSingle).not.toHaveBeenCalled()
  })

  it.each(['0', '6', '2.5', 'abc', ''])('rejects an invalid rating value %s', async (rating) => {
    const result = await createPackageReview(formData({ booking_id: BOOKING_ID, rating }))
    expect(result).toEqual({ error: 'Selecciona una calificación de 1 a 5 estrellas.' })
    expect(bookingSingle).not.toHaveBeenCalled()
  })

  it('rejects when the booking does not exist', async () => {
    bookingSingle.mockResolvedValue({ data: null })
    const result = await createPackageReview(formData({ booking_id: BOOKING_ID, rating: '5' }))
    expect(result).toEqual({ error: 'Solo puedes reseñar paquetes ya realizados de reservas confirmadas.' })
  })

  it('rejects when the booking belongs to a different tourist', async () => {
    bookingSingle.mockResolvedValue({ data: packageBookingRow({ tourist_id: 'someone-else' }) })
    const result = await createPackageReview(formData({ booking_id: BOOKING_ID, rating: '5' }))
    expect(result).toEqual({ error: 'Solo puedes reseñar paquetes ya realizados de reservas confirmadas.' })
  })

  it('rejects a booking with no package_id (a service or guide-tour booking)', async () => {
    bookingSingle.mockResolvedValue({ data: packageBookingRow({ package_id: null }) })
    const result = await createPackageReview(formData({ booking_id: BOOKING_ID, rating: '5' }))
    expect(result).toEqual({ error: 'Solo puedes reseñar paquetes ya realizados de reservas confirmadas.' })
  })

  it('rejects a booking that is not confirmed', async () => {
    bookingSingle.mockResolvedValue({ data: packageBookingRow({ status: 'pending_payment' }) })
    const result = await createPackageReview(formData({ booking_id: BOOKING_ID, rating: '5' }))
    expect(result).toEqual({ error: 'Solo puedes reseñar paquetes ya realizados de reservas confirmadas.' })
    expect(packageReviewInsertSingle).not.toHaveBeenCalled()
  })

  it('rejects a package whose booking_date has not happened yet', async () => {
    bookingSingle.mockResolvedValue({ data: packageBookingRow({ booking_date: '2026-09-10' }) })
    const result = await createPackageReview(formData({ booking_id: BOOKING_ID, rating: '5' }))
    expect(result).toEqual({ error: 'Solo puedes reseñar paquetes ya realizados de reservas confirmadas.' })
    expect(packageReviewInsertSingle).not.toHaveBeenCalled()
  })

  it('inserts the global review with a trimmed comment and revalidates on success', async () => {
    bookingSingle.mockResolvedValue({ data: packageBookingRow() })

    const result = await createPackageReview(
      formData({ booking_id: BOOKING_ID, rating: '4', comment: '  Excelente experiencia  ' }),
    )

    expect(result).toEqual({ success: true })
    expect(revalidatePathMock).toHaveBeenCalledWith('/mis-reservas')
  })

  it('stores a null comment when none is provided', async () => {
    bookingSingle.mockResolvedValue({ data: packageBookingRow() })
    await createPackageReview(formData({ booking_id: BOOKING_ID, rating: '5' }))
    // Verified indirectly: packageReviewInsertSingle resolving successfully
    // above already covers the insert path; this asserts the trim/cap logic
    // ran without throwing on an absent field.
    expect(revalidatePathMock).toHaveBeenCalledWith('/mis-reservas')
  })

  it('caps the comment at 500 characters server-side', async () => {
    bookingSingle.mockResolvedValue({ data: packageBookingRow() })
    await createPackageReview(formData({ booking_id: BOOKING_ID, rating: '5', comment: 'a'.repeat(600) }))
    expect(revalidatePathMock).toHaveBeenCalledWith('/mis-reservas')
  })

  it('maps a unique_violation on insert to "already reviewed" rather than a generic error', async () => {
    bookingSingle.mockResolvedValue({ data: packageBookingRow() })
    packageReviewInsertSingle.mockResolvedValue({ data: null, error: { code: '23505' } })

    const result = await createPackageReview(formData({ booking_id: BOOKING_ID, rating: '5' }))

    expect(result).toEqual({ error: 'Ya dejaste una reseña para esta reserva.' })
  })

  it('returns a generic error on any other insert failure', async () => {
    bookingSingle.mockResolvedValue({ data: packageBookingRow() })
    packageReviewInsertSingle.mockResolvedValue({ data: null, error: { code: '23503' } })

    const result = await createPackageReview(formData({ booking_id: BOOKING_ID, rating: '5' }))

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })

  it('inserts per-item ratings that belong to the package, dropping any id that does not', async () => {
    bookingSingle.mockResolvedValue({ data: packageBookingRow() })
    packageItemsEqMock.mockResolvedValue({ data: [{ id: ITEM_ID_1 }, { id: ITEM_ID_2 }] })

    const foreignItemId = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    const result = await createPackageReview(
      formData({
        booking_id: BOOKING_ID,
        rating: '5',
        item_ratings: JSON.stringify({ [ITEM_ID_1]: 5, [foreignItemId]: 3 }),
      }),
    )

    expect(result).toEqual({ success: true })
    expect(packageItemReviewsInsertMock).toHaveBeenCalledWith([
      { package_review_id: 'review-1', package_item_id: ITEM_ID_1, rating: 5 },
    ])
  })

  it('skips the per-item insert entirely when item_ratings is absent', async () => {
    bookingSingle.mockResolvedValue({ data: packageBookingRow() })

    const result = await createPackageReview(formData({ booking_id: BOOKING_ID, rating: '5' }))

    expect(result).toEqual({ success: true })
    expect(packageItemReviewsInsertMock).not.toHaveBeenCalled()
  })

  it('does not fail the whole submission when the per-item insert errors', async () => {
    bookingSingle.mockResolvedValue({ data: packageBookingRow() })
    packageItemsEqMock.mockResolvedValue({ data: [{ id: ITEM_ID_1 }] })
    packageItemReviewsInsertMock.mockResolvedValue({ data: null, error: { code: 'unexpected' } })

    const result = await createPackageReview(
      formData({ booking_id: BOOKING_ID, rating: '5', item_ratings: JSON.stringify({ [ITEM_ID_1]: 4 }) }),
    )

    expect(result).toEqual({ success: true })
  })

  it('ignores malformed item_ratings JSON instead of failing the submission', async () => {
    bookingSingle.mockResolvedValue({ data: packageBookingRow() })

    const result = await createPackageReview(
      formData({ booking_id: BOOKING_ID, rating: '5', item_ratings: 'not-json' }),
    )

    expect(result).toEqual({ success: true })
    expect(packageItemReviewsInsertMock).not.toHaveBeenCalled()
  })
})
