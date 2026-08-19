import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BookingForm from './BookingForm'

const createBookingMock = vi.fn()

vi.mock('@/app/(app)/reservas/actions', () => ({
  createBooking: (formData: FormData) => createBookingMock(formData),
}))

const SERVICE_ID = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BookingForm', () => {
  it('includes the serviceId as a hidden field', () => {
    const { container } = render(
      <BookingForm serviceId={SERVICE_ID} price={50000} capacity={10} serviceName="Tour" pricingUnit="per_person" />,
    )
    expect(container.querySelector('input[type="hidden"][name="service_id"]')).toHaveValue(SERVICE_ID)
  })

  it('starts with 1 unit and shows the total for that quantity', () => {
    render(<BookingForm serviceId={SERVICE_ID} price={50000} capacity={10} serviceName="Tour" pricingUnit="per_person" />)
    expect(screen.getByLabelText('Número de personas')).toHaveValue(1)
    expect(screen.getByText('$50.000 COP')).toBeInTheDocument()
  })

  it('updates the live total when the quantity changes', () => {
    render(<BookingForm serviceId={SERVICE_ID} price={50000} capacity={10} serviceName="Tour" pricingUnit="per_person" />)

    const input = screen.getByLabelText('Número de personas')
    fireEvent.change(input, { target: { value: '3' } })

    expect(input).toHaveValue(3)
    expect(screen.getByText('$150.000 COP')).toBeInTheDocument()
  })

  it('caps the entered quantity at the service capacity', () => {
    render(<BookingForm serviceId={SERVICE_ID} price={50000} capacity={4} serviceName="Tour" pricingUnit="per_person" />)

    const input = screen.getByLabelText('Número de personas')
    fireEvent.change(input, { target: { value: '9' } })

    expect(input).toHaveValue(4)
    expect(screen.getByText('$200.000 COP')).toBeInTheDocument()
  })

  it('allows any quantity when capacity is null (no cap)', () => {
    render(<BookingForm serviceId={SERVICE_ID} price={1000} capacity={null} serviceName="Tour" pricingUnit="per_person" />)

    const input = screen.getByLabelText('Número de personas')
    fireEvent.change(input, { target: { value: '500' } })

    expect(input).toHaveValue(500)
  })

  it('ignores a cleared/invalid quantity, keeping the last valid value', () => {
    render(<BookingForm serviceId={SERVICE_ID} price={50000} capacity={10} serviceName="Tour" pricingUnit="per_person" />)

    const input = screen.getByLabelText('Número de personas')
    fireEvent.change(input, { target: { value: '' } })

    // An empty value parses to NaN — the handler should ignore it rather
    // than setting an invalid count.
    expect(input).toHaveValue(1)
    expect(screen.getByText('$50.000 COP')).toBeInTheDocument()
  })

  it('submits the booking date, quantity, and hidden service_id', async () => {
    createBookingMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    const { container } = render(
      <BookingForm serviceId={SERVICE_ID} price={50000} capacity={10} serviceName="Tour" pricingUnit="per_person" />,
    )

    const dateInput = container.querySelector('input[name="booking_date"]') as HTMLInputElement
    await user.type(dateInput, dateInput.min)
    await user.click(screen.getByRole('button', { name: 'Confirmar reserva' }))

    expect(createBookingMock).toHaveBeenCalledTimes(1)
    const fd = createBookingMock.mock.calls[0][0] as FormData
    expect(fd.get('service_id')).toBe(SERVICE_ID)
    expect(fd.get('quantity')).toBe('1')
  })

  it('shows the server-returned error message', async () => {
    createBookingMock.mockResolvedValue({ error: 'Supera el cupo máximo disponible.' })
    const user = userEvent.setup()
    render(<BookingForm serviceId={SERVICE_ID} price={50000} capacity={10} serviceName="Tour" pricingUnit="per_person" />)

    await user.click(screen.getByRole('button', { name: 'Confirmar reserva' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Supera el cupo máximo disponible.')
  })

  it('renders no error before submission', () => {
    render(<BookingForm serviceId={SERVICE_ID} price={50000} capacity={10} serviceName="Tour" pricingUnit="per_person" />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    createBookingMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<BookingForm serviceId={SERVICE_ID} price={50000} capacity={10} serviceName="Tour" pricingUnit="per_person" />)

    await user.click(screen.getByRole('button', { name: 'Confirmar reserva' }))

    expect(await screen.findByRole('button', { name: 'Procesando...' })).toBeDisabled()

    resolveAction(undefined)
  })

  it('renders a cancel link back to the businesses list', () => {
    render(<BookingForm serviceId={SERVICE_ID} price={50000} capacity={10} serviceName="Tour" pricingUnit="per_person" />)
    expect(screen.getByRole('link', { name: 'Cancelar' })).toHaveAttribute('href', '/negocios')
  })

  it('shows the "por noche" quantity label and suffix for a per_night service', () => {
    render(<BookingForm serviceId={SERVICE_ID} price={80000} capacity={5} serviceName="Cabaña" pricingUnit="per_night" />)

    expect(screen.getByLabelText('Número de noches')).toBeInTheDocument()
    expect(screen.getByText('$80.000 × 1 por noche')).toBeInTheDocument()
  })

  describe('pricingUnit "fixed"', () => {
    it('shows the total as the flat price and the "precio fijo" wording, with no multiplication', () => {
      render(<BookingForm serviceId={SERVICE_ID} price={300000} capacity={20} serviceName="Carpa evento" pricingUnit="fixed" />)

      expect(screen.getByText('$300.000 COP')).toBeInTheDocument()
      expect(screen.getByText('precio fijo')).toBeInTheDocument()
    })

    it('keeps the total constant regardless of quantity changes', () => {
      render(<BookingForm serviceId={SERVICE_ID} price={300000} capacity={20} serviceName="Carpa evento" pricingUnit="fixed" />)

      const input = screen.getByLabelText('Cantidad')
      fireEvent.change(input, { target: { value: '5' } })

      expect(input).toHaveValue(5)
      expect(screen.getByText('$300.000 COP')).toBeInTheDocument()
      expect(screen.getByText('precio fijo')).toBeInTheDocument()
    })
  })
})
