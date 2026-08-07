import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TourBookingForm from './TourBookingForm'

const createGuideTourBookingMock = vi.fn()
const routerPushMock = vi.fn()

vi.mock('@/app/(app)/reservas/actions', () => ({
  createGuideTourBooking: (formData: FormData) => createGuideTourBookingMock(formData),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}))

const TOUR_ID = '22222222-2222-2222-2222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TourBookingForm — access="other_role"', () => {
  it('renders nothing', () => {
    const { container } = render(<TourBookingForm guideTourId={TOUR_ID} price={50000} access="other_role" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('TourBookingForm — access="guest"', () => {
  it('renders a login-redirect button instead of the form', () => {
    render(<TourBookingForm guideTourId={TOUR_ID} price={50000} access="guest" />)
    expect(screen.getByRole('button', { name: 'Confirmar reserva' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Número de personas')).not.toBeInTheDocument()
  })

  it('redirects to /login with a next param pointing back to the current page on click', async () => {
    const user = userEvent.setup()
    render(<TourBookingForm guideTourId={TOUR_ID} price={50000} access="guest" />)

    await user.click(screen.getByRole('button', { name: 'Confirmar reserva' }))

    expect(routerPushMock).toHaveBeenCalledWith(
      '/login?next=' + encodeURIComponent(window.location.pathname),
    )
  })
})

describe('TourBookingForm — access="tourist"', () => {
  it('renders the booking form with the hidden guide_tour_id and formatted price', () => {
    const { container } = render(<TourBookingForm guideTourId={TOUR_ID} price={50000} access="tourist" />)

    expect(container.querySelector('input[name="guide_tour_id"]')).toHaveValue(TOUR_ID)
    expect(screen.getByText('$50.000 COP')).toBeInTheDocument()
  })

  it('defaults people_count to 1 and sets a valid, non-past booking_date', () => {
    render(<TourBookingForm guideTourId={TOUR_ID} price={50000} access="tourist" />)

    expect(screen.getByLabelText('Número de personas')).toHaveValue(1)
    const dateInput = screen.getByLabelText('Fecha del tour') as HTMLInputElement
    expect(dateInput.value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(dateInput.min).toBe(dateInput.value)
  })

  it('submits people_count, booking_date, notes, and the hidden guide_tour_id', async () => {
    createGuideTourBookingMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<TourBookingForm guideTourId={TOUR_ID} price={50000} access="tourist" />)

    await user.clear(screen.getByLabelText('Número de personas'))
    await user.type(screen.getByLabelText('Número de personas'), '3')
    await user.type(screen.getByLabelText(/notas para el guía/i), 'Punto de encuentro: parque')
    await user.click(screen.getByRole('button', { name: 'Confirmar reserva' }))

    expect(createGuideTourBookingMock).toHaveBeenCalledTimes(1)
    const fd = createGuideTourBookingMock.mock.calls[0][0] as FormData
    expect(fd.get('guide_tour_id')).toBe(TOUR_ID)
    expect(fd.get('people_count')).toBe('3')
    expect(fd.get('notes')).toBe('Punto de encuentro: parque')
  })

  it('shows the server-returned error message', async () => {
    createGuideTourBookingMock.mockResolvedValue({ error: 'Esta experiencia no está disponible en este momento.' })
    const user = userEvent.setup()
    render(<TourBookingForm guideTourId={TOUR_ID} price={50000} access="tourist" />)

    await user.click(screen.getByRole('button', { name: 'Confirmar reserva' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Esta experiencia no está disponible en este momento.')
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    createGuideTourBookingMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<TourBookingForm guideTourId={TOUR_ID} price={50000} access="tourist" />)

    await user.click(screen.getByRole('button', { name: 'Confirmar reserva' }))

    expect(await screen.findByRole('button', { name: 'Procesando...' })).toBeDisabled()

    resolveAction(undefined)
  })
})
