import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import TransportRequestForm from './TransportRequestForm'

const createTransportRequestMock = vi.fn()

vi.mock('@/app/(app)/transporte/actions', () => ({
  createTransportRequest: (...args: unknown[]) => createTransportRequestMock(...args),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

async function fillRequiredFields(container: HTMLElement, user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/punto de recogida/i), 'Hotel El Paraíso')
  await user.type(screen.getByLabelText(/destino/i), 'Balneario El Edén')
  const datetimeInput = container.querySelector('input[name="requested_datetime"]') as HTMLInputElement
  fireEvent.change(datetimeInput, { target: { value: datetimeInput.min } })
}

describe('TransportRequestForm', () => {
  it('defaults people_count to 1 and sets a minimum datetime in the near future', () => {
    render(<TransportRequestForm />)
    expect(screen.getByLabelText('Número de personas')).toHaveValue(1)

    const datetimeInput = screen.getByLabelText(/fecha y hora/i) as HTMLInputElement
    expect(datetimeInput.min.length).toBeGreaterThan(0)
  })

  it('submits origin, destination, requested_datetime, people_count, and notes', async () => {
    createTransportRequestMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    const { container } = render(<TransportRequestForm />)

    await fillRequiredFields(container, user)
    await user.type(screen.getByLabelText(/información adicional/i), 'Somos 2 adultos')
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

    expect(createTransportRequestMock).toHaveBeenCalledTimes(1)
    // createTransportRequest is passed directly as the useActionState action,
    // so it receives (prevState, formData) — formData is the second argument.
    const fd = createTransportRequestMock.mock.calls[0][1] as FormData
    expect(fd.get('origin')).toBe('Hotel El Paraíso')
    expect(fd.get('destination')).toBe('Balneario El Edén')
    expect(fd.get('people_count')).toBe('1')
    expect(fd.get('notes')).toBe('Somos 2 adultos')
  })

  it('shows the server-returned error message as a toast', async () => {
    createTransportRequestMock.mockResolvedValue({ error: 'Ocurrió un error. Intenta de nuevo.' })
    const user = userEvent.setup()
    const { container } = render(<TransportRequestForm />)

    await fillRequiredFields(container, user)
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Ocurrió un error. Intenta de nuevo.'))
  })

  it('shows no error toast before submission', () => {
    render(<TransportRequestForm />)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    createTransportRequestMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    const { container } = render(<TransportRequestForm />)

    await fillRequiredFields(container, user)
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

    expect(await screen.findByRole('button', { name: 'Enviando...' })).toBeDisabled()

    resolveAction(undefined)
  })

  it('does not render a route selector when no routes are published', () => {
    render(<TransportRequestForm />)
    expect(screen.queryByLabelText('Ruta (opcional)')).not.toBeInTheDocument()
  })
})

describe('TransportRequestForm — with published routes', () => {
  const ROUTES = [
    {
      id: 'route-1',
      origin: 'Casco urbano',
      destination: 'Cascada El Salto',
      allowsOneWay: true,
      allowsRoundTrip: true,
      priceOneWayCents: 1_500_000,
      priceRoundTripCents: 2_500_000,
      blockedDates: [],
    },
    {
      id: 'route-2',
      origin: 'Terminal',
      destination: 'Aeropuerto',
      allowsOneWay: true,
      allowsRoundTrip: false,
      priceOneWayCents: null,
      priceRoundTripCents: null,
      blockedDates: [],
    },
  ]

  it('defaults to "Traslado personalizado" and shows the free-text fields', () => {
    render(<TransportRequestForm routes={ROUTES} />)
    expect(screen.getByLabelText('Ruta (opcional)')).toHaveValue('')
    expect(screen.getByLabelText(/punto de recogida/i)).toBeInTheDocument()
  })

  it('selecting a two-modality route hides the free-text fields and shows a trip-type choice with prices', () => {
    render(<TransportRequestForm routes={ROUTES} />)

    fireEvent.change(screen.getByLabelText('Ruta (opcional)'), { target: { value: 'route-1' } })

    expect(screen.queryByLabelText(/punto de recogida/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/solo ida.*15.000/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/ida y vuelta.*25.000/i)).toBeInTheDocument()
  })

  it('selecting a one-modality route shows no trip-type choice', () => {
    render(<TransportRequestForm routes={ROUTES} />)

    fireEvent.change(screen.getByLabelText('Ruta (opcional)'), { target: { value: 'route-2' } })

    expect(screen.queryByText('¿Ida o ida y vuelta?')).not.toBeInTheDocument()
  })

  it('submits transporter_route_id, trip_type, and a date+time built from the picker', async () => {
    createTransportRequestMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<TransportRequestForm routes={ROUTES} />)

    fireEvent.change(screen.getByLabelText('Ruta (opcional)'), { target: { value: 'route-1' } })
    await user.click(screen.getByRole('radio', { name: /ida y vuelta/i }))

    const dayButtons = screen.getAllByRole('button', { name: /: Disponible$/ })
    fireEvent.click(dayButtons[0])
    const timeInput = document.querySelector('input[type="time"]') as HTMLInputElement
    fireEvent.change(timeInput, { target: { value: '14:30' } })

    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

    expect(createTransportRequestMock).toHaveBeenCalledTimes(1)
    const fd = createTransportRequestMock.mock.calls[0][1] as FormData
    expect(fd.get('transporter_route_id')).toBe('route-1')
    expect(fd.get('trip_type')).toBe('round_trip')
    expect(fd.get('requested_datetime')).toMatch(/T14:30$/)
  })
})
