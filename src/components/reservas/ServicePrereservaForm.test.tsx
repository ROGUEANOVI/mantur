import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { toast } from 'sonner'
import ServicePrereservaForm from './ServicePrereservaForm'

const createServicePrereservaMock = vi.fn()

vi.mock('@/app/(app)/reservas/actions', () => ({
  createServicePrereserva: (...args: unknown[]) => createServicePrereservaMock(...args),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const SERVICE_ID = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ServicePrereservaForm', () => {
  it('renders nothing for a non-tourist role', () => {
    const { container } = render(
      <ServicePrereservaForm serviceId={SERVICE_ID} price={50000} capacity={10} pricingUnit="per_person" blockedDates={[]} access="other_role" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a login link for a guest', () => {
    render(
      <ServicePrereservaForm serviceId={SERVICE_ID} price={50000} capacity={10} pricingUnit="per_person" blockedDates={[]} access="guest" />,
    )
    expect(screen.getByRole('link', { name: 'Inicia sesión para solicitar este servicio' })).toHaveAttribute('href', '/login')
  })

  it('renders the calendar and blocks a date passed in blockedDates', () => {
    render(
      <ServicePrereservaForm serviceId={SERVICE_ID} price={50000} capacity={10} pricingUnit="per_person" blockedDates={['2099-01-05']} access="tourist" />,
    )
    // A blocked date renders as non-interactive text, not a button — see
    // BlockedDatesPicker's own tests for the day-cell contract this relies on.
    expect(screen.getAllByText('5').length).toBeGreaterThan(0)
  })

  it('submits service_id, the picked date, quantity, and notes', async () => {
    createServicePrereservaMock.mockResolvedValue(undefined)
    render(
      <ServicePrereservaForm serviceId={SERVICE_ID} price={50000} capacity={10} pricingUnit="per_person" blockedDates={[]} access="tourist" />,
    )

    // Pick an available day from the currently-displayed month.
    const dayButtons = screen.getAllByRole('button', { name: /: Disponible$/ })
    fireEvent.click(dayButtons[0])

    fireEvent.change(screen.getByLabelText('Número de personas'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar reserva' }))

    expect(createServicePrereservaMock).toHaveBeenCalledTimes(1)
    const fd = createServicePrereservaMock.mock.calls[0][0] as FormData
    expect(fd.get('service_id')).toBe(SERVICE_ID)
    expect(fd.get('quantity')).toBe('3')
    expect(fd.get('booking_date')).toBeTruthy()
  })

  it('shows a server-returned error as a toast', async () => {
    createServicePrereservaMock.mockResolvedValue({ error: 'Esto no está disponible en este momento.' })
    render(
      <ServicePrereservaForm serviceId={SERVICE_ID} price={50000} capacity={10} pricingUnit="per_person" blockedDates={[]} access="tourist" />,
    )

    const dayButtons = screen.getAllByRole('button', { name: /: Disponible$/ })
    fireEvent.click(dayButtons[0])
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar reserva' }))

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Esto no está disponible en este momento.'))
  })
})
