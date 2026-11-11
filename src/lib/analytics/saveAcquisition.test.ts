import { describe, it, expect, vi, beforeEach } from 'vitest'
import { saveAcquisition } from './saveAcquisition'

const eqMock = vi.fn()
const updateMock = vi.fn(() => ({ eq: eqMock }))
const fromMock = vi.fn(() => ({ update: updateMock }))
const admin = { from: fromMock } as unknown as Parameters<typeof saveAcquisition>[0]

beforeEach(() => {
  vi.clearAllMocks()
  eqMock.mockResolvedValue({ error: null })
})

describe('saveAcquisition', () => {
  it('skips the write when there is nothing to store', async () => {
    await saveAcquisition(admin, 'b1', { acquisition_source: null, acquisition_campaign: null })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('updates the booking with the source and campaign', async () => {
    await saveAcquisition(admin, 'b1', { acquisition_source: 'meta_ads', acquisition_campaign: 'mt_x' })
    expect(fromMock).toHaveBeenCalledWith('bookings')
    expect(updateMock).toHaveBeenCalledWith({ acquisition_source: 'meta_ads', acquisition_campaign: 'mt_x' })
    expect(eqMock).toHaveBeenCalledWith('id', 'b1')
  })

  it('never throws — a lost channel must not fail the sale', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    eqMock.mockResolvedValue({ error: { message: 'boom' } })
    await expect(saveAcquisition(admin, 'b1', { acquisition_source: 'other', acquisition_campaign: null })).resolves.toBeUndefined()

    eqMock.mockRejectedValue(new Error('network'))
    await expect(saveAcquisition(admin, 'b1', { acquisition_source: 'other', acquisition_campaign: null })).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })
})
