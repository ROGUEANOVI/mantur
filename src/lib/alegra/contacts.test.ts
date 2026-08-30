import { describe, it, expect, vi, beforeEach } from 'vitest'

const alegraRequestMock = vi.fn()
vi.mock('./client', () => ({
  alegraRequest: (...args: unknown[]) => alegraRequestMock(...args),
}))

const { findOrCreateContact } = await import('./contacts')

const PARAMS = { legalIdType: 'CC', legalId: '1002003000', name: 'Prueba Wompi Sandbox', email: 'tourist@example.com' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('findOrCreateContact', () => {
  it('reuses an existing contact when the search finds an exact identification match', async () => {
    alegraRequestMock.mockResolvedValueOnce({ ok: true, data: [{ id: 42, identification: '1002003000' }] })

    const result = await findOrCreateContact(PARAMS)

    expect(result).toEqual({ ok: true, contactId: '42' })
    expect(alegraRequestMock).toHaveBeenCalledTimes(1)
    expect(alegraRequestMock).toHaveBeenCalledWith('/contacts?identification=1002003000')
  })

  it('ignores a substring match that is not an exact identification match, and creates a new contact instead', async () => {
    alegraRequestMock
      .mockResolvedValueOnce({ ok: true, data: [{ id: 1, identification: '21002003000' }] })
      .mockResolvedValueOnce({ ok: true, data: { id: 43 } })

    const result = await findOrCreateContact(PARAMS)

    expect(result).toEqual({ ok: true, contactId: '43' })
    expect(alegraRequestMock).toHaveBeenCalledTimes(2)
  })

  it('creates a new contact with the Colombia identificationObject/kindOfPerson/regime shape when none exists', async () => {
    alegraRequestMock
      .mockResolvedValueOnce({ ok: true, data: [] })
      .mockResolvedValueOnce({ ok: true, data: { id: 43 } })

    await findOrCreateContact(PARAMS)

    expect(alegraRequestMock).toHaveBeenNthCalledWith(2, '/contacts', {
      method: 'POST',
      body: {
        name: 'Prueba Wompi Sandbox',
        email: 'tourist@example.com',
        identificationObject: { number: '1002003000', type: 'CC' },
        kindOfPerson: 'PERSON_ENTITY',
        regime: 'SIMPLIFIED_REGIME',
      },
    })
  })

  it('omits email from the create body when null', async () => {
    alegraRequestMock
      .mockResolvedValueOnce({ ok: true, data: [] })
      .mockResolvedValueOnce({ ok: true, data: { id: 43 } })

    await findOrCreateContact({ ...PARAMS, email: null })

    expect(alegraRequestMock).toHaveBeenNthCalledWith(
      2,
      '/contacts',
      expect.objectContaining({ body: expect.objectContaining({ email: undefined }) }),
    )
  })

  it('still attempts to create a contact when the search request itself fails', async () => {
    alegraRequestMock
      .mockResolvedValueOnce({ ok: false, error: 'Alegra API returned 500' })
      .mockResolvedValueOnce({ ok: true, data: { id: 43 } })

    const result = await findOrCreateContact(PARAMS)

    expect(result).toEqual({ ok: true, contactId: '43' })
  })

  it('propagates a failure from the create request', async () => {
    alegraRequestMock
      .mockResolvedValueOnce({ ok: true, data: [] })
      .mockResolvedValueOnce({ ok: false, error: 'Alegra API returned 422: invalid regime' })

    const result = await findOrCreateContact(PARAMS)

    expect(result).toEqual({ ok: false, error: 'Alegra API returned 422: invalid regime' })
  })

  it('returns ok:false when the create response is missing an id', async () => {
    alegraRequestMock
      .mockResolvedValueOnce({ ok: true, data: [] })
      .mockResolvedValueOnce({ ok: true, data: {} })

    const result = await findOrCreateContact(PARAMS)

    expect(result.ok).toBe(false)
  })
})
