import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { PendingPaymentPoller } from './PendingPaymentPoller'

const refreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

beforeEach(() => {
  vi.useFakeTimers()
  refreshMock.mockClear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('PendingPaymentPoller', () => {
  it('calls router.refresh() every 4 seconds', () => {
    render(<PendingPaymentPoller />)

    expect(refreshMock).not.toHaveBeenCalled()
    vi.advanceTimersByTime(4000)
    expect(refreshMock).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(4000)
    expect(refreshMock).toHaveBeenCalledTimes(2)
  })

  it('stops calling router.refresh() after the max poll count', () => {
    render(<PendingPaymentPoller />)

    vi.advanceTimersByTime(4000 * 20)
    expect(refreshMock).toHaveBeenCalledTimes(15)

    refreshMock.mockClear()
    vi.advanceTimersByTime(4000 * 5)
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('clears the interval on unmount', () => {
    const { unmount } = render(<PendingPaymentPoller />)
    unmount()

    vi.advanceTimersByTime(20000)
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('renders nothing', () => {
    const { container } = render(<PendingPaymentPoller />)
    expect(container).toBeEmptyDOMElement()
  })
})
