import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BookingForm from './BookingForm'

const createBookingMock = vi.fn()

vi.mock('@/app/(app)/reservas/actions', () => ({
  createBooking: (formData: FormData) => createBookingMock(formData),
}))

const EXP_ID = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BookingForm', () => {
  it('includes the experienceId as a hidden field', () => {
    const { container } = render(
      <BookingForm experienceId={EXP_ID} price={50000} capacity={10} experienceName="Tour" />,
    )
    expect(container.querySelector('input[type="hidden"][name="experience_id"]')).toHaveValue(EXP_ID)
  })

  it('starts with 1 person and shows the total for that quantity', () => {
    render(<BookingForm experienceId={EXP_ID} price={50000} capacity={10} experienceName="Tour" />)
    expect(screen.getByLabelText('Número de personas')).toHaveValue(1)
    expect(screen.getByText('$50.000 COP')).toBeInTheDocument()
  })

  it('updates the live total when the number of people changes', () => {
    render(<BookingForm experienceId={EXP_ID} price={50000} capacity={10} experienceName="Tour" />)

    const input = screen.getByLabelText('Número de personas')
    fireEvent.change(input, { target: { value: '3' } })

    expect(input).toHaveValue(3)
    expect(screen.getByText('$150.000 COP')).toBeInTheDocument()
  })

  it('caps the entered quantity at the experience capacity', () => {
    render(<BookingForm experienceId={EXP_ID} price={50000} capacity={4} experienceName="Tour" />)

    const input = screen.getByLabelText('Número de personas')
    fireEvent.change(input, { target: { value: '9' } })

    expect(input).toHaveValue(4)
    expect(screen.getByText('$200.000 COP')).toBeInTheDocument()
  })

  it('allows any quantity when capacity is null (no cap)', () => {
    render(<BookingForm experienceId={EXP_ID} price={1000} capacity={null} experienceName="Tour" />)

    const input = screen.getByLabelText('Número de personas')
    fireEvent.change(input, { target: { value: '500' } })

    expect(input).toHaveValue(500)
  })

  it('ignores a cleared/invalid quantity, keeping the last valid value', () => {
    render(<BookingForm experienceId={EXP_ID} price={50000} capacity={10} experienceName="Tour" />)

    const input = screen.getByLabelText('Número de personas')
    fireEvent.change(input, { target: { value: '' } })

    // An empty value parses to NaN — the handler should ignore it rather
    // than setting an invalid count.
    expect(input).toHaveValue(1)
    expect(screen.getByText('$50.000 COP')).toBeInTheDocument()
  })

  it('submits the booking date, people_count, and hidden experience_id', async () => {
    createBookingMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    const { container } = render(
      <BookingForm experienceId={EXP_ID} price={50000} capacity={10} experienceName="Tour" />,
    )

    const dateInput = container.querySelector('input[name="booking_date"]') as HTMLInputElement
    await user.type(dateInput, dateInput.min)
    await user.click(screen.getByRole('button', { name: 'Confirmar reserva' }))

    expect(createBookingMock).toHaveBeenCalledTimes(1)
    const fd = createBookingMock.mock.calls[0][0] as FormData
    expect(fd.get('experience_id')).toBe(EXP_ID)
    expect(fd.get('people_count')).toBe('1')
  })

  it('shows the server-returned error message', async () => {
    createBookingMock.mockResolvedValue({ error: 'Supera el cupo máximo de esta experiencia.' })
    const user = userEvent.setup()
    render(<BookingForm experienceId={EXP_ID} price={50000} capacity={10} experienceName="Tour" />)

    await user.click(screen.getByRole('button', { name: 'Confirmar reserva' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Supera el cupo máximo de esta experiencia.')
  })

  it('renders no error before submission', () => {
    render(<BookingForm experienceId={EXP_ID} price={50000} capacity={10} experienceName="Tour" />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    createBookingMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<BookingForm experienceId={EXP_ID} price={50000} capacity={10} experienceName="Tour" />)

    await user.click(screen.getByRole('button', { name: 'Confirmar reserva' }))

    expect(await screen.findByRole('button', { name: 'Procesando...' })).toBeDisabled()

    resolveAction(undefined)
  })

  it('renders a cancel link back to the businesses list', () => {
    render(<BookingForm experienceId={EXP_ID} price={50000} capacity={10} experienceName="Tour" />)
    expect(screen.getByRole('link', { name: 'Cancelar' })).toHaveAttribute('href', '/negocios')
  })
})
