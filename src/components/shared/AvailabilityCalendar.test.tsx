import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import AvailabilityCalendar from './AvailabilityCalendar'

const toastErrorMock = vi.fn()
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
}))

const COPY = {
  weekdays: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
  months: [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ],
  markUnavailable: 'Marcar no disponible',
  markAvailable: 'Marcar disponible',
  legendAvailable: 'Disponible',
  legendUnavailable: 'No disponible',
  prevMonth: 'Mes anterior',
  nextMonth: 'Mes siguiente',
}

const PROVIDER_ID = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
  // Frozen "today" so past/future day classification and the visible
  // month are deterministic regardless of when the suite actually runs.
  // Only Date is faked (not timers) — waitFor()/userEvent rely on real
  // setTimeout internally and hang forever under a fully fake clock.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 15, 12, 0, 0)) // 2026-09-15
})

afterEach(() => {
  vi.useRealTimers()
})

function formValues(fd: FormData) {
  return Object.fromEntries(fd.entries())
}

describe('AvailabilityCalendar', () => {
  it('renders the current month/year and weekday headers', () => {
    render(
      <AvailabilityCalendar
        providerType="business"
        providerId={PROVIDER_ID}
        action={vi.fn()}
        unavailableDates={[]}
        copy={COPY}
      />,
    )

    expect(screen.getByText('Septiembre 2026')).toBeInTheDocument()
    for (const wd of COPY.weekdays) {
      expect(screen.getAllByText(wd).length).toBeGreaterThan(0)
    }
  })

  it('renders a past day as disabled text, not a clickable button', () => {
    render(
      <AvailabilityCalendar
        providerType="business"
        providerId={PROVIDER_ID}
        action={vi.fn()}
        unavailableDates={[]}
        copy={COPY}
      />,
    )

    expect(screen.queryByRole('button', { name: /^10:/ })).not.toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
  })

  it('renders today and future days as buttons offering to mark unavailable by default', () => {
    render(
      <AvailabilityCalendar
        providerType="business"
        providerId={PROVIDER_ID}
        action={vi.fn()}
        unavailableDates={[]}
        copy={COPY}
      />,
    )

    expect(screen.getByRole('button', { name: '15: Marcar no disponible' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '25: Marcar no disponible' })).toBeInTheDocument()
  })

  it('shows a day already marked unavailable with the flip-to-available action', () => {
    render(
      <AvailabilityCalendar
        providerType="business"
        providerId={PROVIDER_ID}
        action={vi.fn()}
        unavailableDates={['2026-09-20']}
        copy={COPY}
      />,
    )

    const button = screen.getByRole('button', { name: '20: Marcar disponible' })
    expect(button).toHaveClass('bg-red-100')
  })

  it('submits the correct hidden fields when marking a future date unavailable', async () => {
    const actionMock = vi.fn().mockResolvedValue(undefined)

    render(
      <AvailabilityCalendar
        providerType="business"
        providerId={PROVIDER_ID}
        action={actionMock}
        unavailableDates={[]}
        copy={COPY}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '25: Marcar no disponible' }))

    await waitFor(() => expect(actionMock).toHaveBeenCalledTimes(1))
    const values = formValues(actionMock.mock.calls[0][0] as FormData)
    expect(values).toEqual({
      businessId: PROVIDER_ID,
      providerId: PROVIDER_ID,
      providerType: 'business',
      date: '2026-09-25',
      status: 'unavailable',
    })
  })

  it('flips status to available when clicking an already-unavailable date', async () => {
    const actionMock = vi.fn().mockResolvedValue(undefined)

    render(
      <AvailabilityCalendar
        providerType="guide"
        providerId={PROVIDER_ID}
        action={actionMock}
        unavailableDates={['2026-09-20']}
        copy={COPY}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '20: Marcar disponible' }))

    await waitFor(() => expect(actionMock).toHaveBeenCalledTimes(1))
    const values = formValues(actionMock.mock.calls[0][0] as FormData)
    expect(values.status).toBe('available')
    expect(values.date).toBe('2026-09-20')
    expect(values.providerType).toBe('guide')
  })

  it('navigates to the next and previous month', () => {
    render(
      <AvailabilityCalendar
        providerType="business"
        providerId={PROVIDER_ID}
        action={vi.fn()}
        unavailableDates={[]}
        copy={COPY}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: COPY.nextMonth }))
    expect(screen.getByText('Octubre 2026')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: COPY.prevMonth }))
    fireEvent.click(screen.getByRole('button', { name: COPY.prevMonth }))
    expect(screen.getByText('Agosto 2026')).toBeInTheDocument()
  })

  it('shows an error toast when the action fails', async () => {
    const actionMock = vi.fn().mockResolvedValue({ error: 'Ocurrió un error. Intenta de nuevo.' })

    render(
      <AvailabilityCalendar
        providerType="business"
        providerId={PROVIDER_ID}
        action={actionMock}
        unavailableDates={[]}
        copy={COPY}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '25: Marcar no disponible' }))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Ocurrió un error. Intenta de nuevo.'))
  })
})
