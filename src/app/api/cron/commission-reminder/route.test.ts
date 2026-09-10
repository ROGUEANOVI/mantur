import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

function builder(listResult: () => unknown) {
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    in: () => b,
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(listResult()).then(resolve, reject),
  }
  return b
}

const commissionsListMock = vi.fn()
const businessesListMock = vi.fn()
const guidesListMock = vi.fn()
const transportersListMock = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'provider_commissions') return builder(commissionsListMock)
      if (table === 'businesses') return builder(businessesListMock)
      if (table === 'tourist_guides') return builder(guidesListMock)
      if (table === 'transporters') return builder(transportersListMock)
      throw new Error(`unexpected table: ${table}`)
    },
  })),
}))

const resolveAdminEmailsMock = vi.fn()
vi.mock('@/lib/adminNotifications', () => ({
  resolveAdminEmails: (...args: unknown[]) => resolveAdminEmailsMock(...args),
}))

const sendCommissionReminderEmailMock = vi.fn()
vi.mock('@/lib/email/commissionEmails', () => ({
  sendCommissionReminderEmail: (...args: unknown[]) => sendCommissionReminderEmailMock(...args),
}))

const { GET } = await import('./route')

const SECRET = 'test-cron-secret'
const ORIGINAL_ENV = { ...process.env }

function cronRequest(bearer: string | null = SECRET) {
  return new Request('https://mantur.co/api/cron/commission-reminder', {
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = SECRET
  commissionsListMock.mockResolvedValue({ data: [], error: null })
  businessesListMock.mockResolvedValue({ data: [] })
  guidesListMock.mockResolvedValue({ data: [] })
  transportersListMock.mockResolvedValue({ data: [] })
  resolveAdminEmailsMock.mockResolvedValue([])
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('GET /api/cron/commission-reminder', () => {
  it('returns 500 and never queries when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET
    const response = await GET(cronRequest())
    expect(response.status).toBe(500)
    expect(commissionsListMock).not.toHaveBeenCalled()
  })

  it('rejects with 401 on a missing or wrong bearer token', async () => {
    const response = await GET(cronRequest('wrong-secret'))
    expect(response.status).toBe(401)
    expect(commissionsListMock).not.toHaveBeenCalled()
  })

  it('returns 500 when the pending-commissions query fails', async () => {
    commissionsListMock.mockResolvedValue({ data: null, error: { message: 'db down' } })
    const response = await GET(cronRequest())
    expect(response.status).toBe(500)
    expect(resolveAdminEmailsMock).not.toHaveBeenCalled()
  })

  it('sends nothing and reports sent:false when there is no pending commission', async () => {
    commissionsListMock.mockResolvedValue({ data: [], error: null })
    const response = await GET(cronRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true, sent: false, reason: 'nothing pending' })
    expect(resolveAdminEmailsMock).not.toHaveBeenCalled()
    expect(sendCommissionReminderEmailMock).not.toHaveBeenCalled()
  })

  it('groups pending commission by recipient, resolves names across the three provider tables, and emails every admin', async () => {
    commissionsListMock.mockResolvedValue({
      data: [
        { recipient_type: 'business', recipient_id: 'biz-1', commission_amount_cents: 10_000_00 },
        { recipient_type: 'business', recipient_id: 'biz-1', commission_amount_cents: 5_000_00 },
        { recipient_type: 'guide', recipient_id: 'guide-1', commission_amount_cents: 6_000_00 },
        { recipient_type: 'transporter', recipient_id: 'trans-1', commission_amount_cents: 2_000_00 },
      ],
      error: null,
    })
    businessesListMock.mockResolvedValue({ data: [{ id: 'biz-1', name: 'Finca El Paraíso' }] })
    guidesListMock.mockResolvedValue({ data: [{ id: 'guide-1', profiles: { full_name: 'Ana Pérez' } }] })
    transportersListMock.mockResolvedValue({ data: [{ id: 'trans-1', profiles: { full_name: 'Moto Express' } }] })
    resolveAdminEmailsMock.mockResolvedValue(['admin1@mantur.co', 'admin2@mantur.co'])

    const response = await GET(cronRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true, sent: true, groups: 3, totalCents: 23_000_00, emailsSent: 2 })

    expect(sendCommissionReminderEmailMock).toHaveBeenCalledTimes(2)
    const [to, groups, totalCents] = sendCommissionReminderEmailMock.mock.calls[0]
    expect(to).toBe('admin1@mantur.co')
    expect(totalCents).toBe(23_000_00)
    expect(groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recipientName: 'Finca El Paraíso', recipientType: 'business', subtotalCents: 15_000_00, count: 2 }),
        expect.objectContaining({ recipientName: 'Ana Pérez', recipientType: 'guide', subtotalCents: 6_000_00, count: 1 }),
        expect.objectContaining({ recipientName: 'Moto Express', recipientType: 'transporter', subtotalCents: 2_000_00, count: 1 }),
      ]),
    )
    expect(sendCommissionReminderEmailMock).toHaveBeenCalledWith('admin2@mantur.co', groups, totalCents)
  })
})
