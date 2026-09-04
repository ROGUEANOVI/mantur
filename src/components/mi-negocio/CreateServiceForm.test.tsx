import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import CreateServiceForm from './CreateServiceForm'

const createServiceMock = vi.fn()

vi.mock('@/app/(app)/mi-negocio/actions', () => ({
  createService: (formData: FormData) => createServiceMock(formData),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const BIZ_ID = '11111111-1111-1111-1111-111111111111'

const SERVICE_TYPES = [
  { id: 'type-tour', slug: 'tour_activity', name: 'Tour / actividad', pricing_unit: 'per_person' as const },
  { id: 'type-lodging', slug: 'lodging', name: 'Alojamiento', pricing_unit: 'per_night' as const },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CreateServiceForm', () => {
  it('includes the businessId as a hidden field', () => {
    const { container } = render(<CreateServiceForm businessId={BIZ_ID} serviceTypes={SERVICE_TYPES} />)
    const hidden = container.querySelector('input[type="hidden"][name="business_id"]')
    expect(hidden).toHaveValue(BIZ_ID)
  })

  it('renders a radio option for each service type', () => {
    render(<CreateServiceForm businessId={BIZ_ID} serviceTypes={SERVICE_TYPES} />)
    expect(screen.getByRole('radio', { name: 'Tour / actividad' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Alojamiento' })).toBeInTheDocument()
  })

  it('does not render the rest of the form until a service type is selected', () => {
    render(<CreateServiceForm businessId={BIZ_ID} serviceTypes={SERVICE_TYPES} />)
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Descripción')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Cupo máximo')).not.toBeInTheDocument()
  })

  it('disables the submit button until a service type is selected', async () => {
    const user = userEvent.setup()
    render(<CreateServiceForm businessId={BIZ_ID} serviceTypes={SERVICE_TYPES} />)

    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()

    await user.click(screen.getByRole('radio', { name: 'Tour / actividad' }))

    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled()
  })

  it('reveals the name/description/price/capacity fields plus that type\'s attribute fields once a type is selected', async () => {
    const user = userEvent.setup()
    render(<CreateServiceForm businessId={BIZ_ID} serviceTypes={SERVICE_TYPES} />)

    await user.click(screen.getByRole('radio', { name: 'Tour / actividad' }))

    expect(screen.getByLabelText('Nombre')).toBeInTheDocument()
    expect(screen.getByLabelText('Descripción')).toBeInTheDocument()
    expect(screen.getByLabelText('Precio por persona (COP)')).toBeInTheDocument()
    expect(screen.getByLabelText('Cupo máximo')).toBeInTheDocument()
    expect(screen.getByLabelText('Duración (minutos)')).toBeInTheDocument()
    expect(screen.getByLabelText('Punto de encuentro')).toBeInTheDocument()
  })

  it('swaps the attribute fields shown when the selected type changes', async () => {
    const user = userEvent.setup()
    render(<CreateServiceForm businessId={BIZ_ID} serviceTypes={SERVICE_TYPES} />)

    await user.click(screen.getByRole('radio', { name: 'Tour / actividad' }))
    expect(screen.getByLabelText('Duración (minutos)')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Alojamiento' }))

    expect(screen.queryByLabelText('Duración (minutos)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Punto de encuentro')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Habitaciones')).toBeInTheDocument()
    expect(screen.getByLabelText('Camas')).toBeInTheDocument()
    expect(screen.getByLabelText('Hora de check-in')).toBeInTheDocument()
    expect(screen.getByLabelText('Hora de check-out')).toBeInTheDocument()
    // Price label also swaps with the pricing unit
    expect(screen.getByLabelText('Precio por noche (COP)')).toBeInTheDocument()
  })

  it('submits business_id, service_type_id, the base fields, and attr_* fields', async () => {
    createServiceMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<CreateServiceForm businessId={BIZ_ID} serviceTypes={SERVICE_TYPES} />)

    await user.click(screen.getByRole('radio', { name: 'Tour / actividad' }))
    await user.type(screen.getByLabelText('Nombre'), 'Tour por el río')
    await user.type(screen.getByLabelText('Precio por persona (COP)'), '50000')
    await user.type(screen.getByLabelText('Cupo máximo'), '10')
    await user.type(screen.getByLabelText('Duración (minutos)'), '90')
    await user.type(screen.getByLabelText('Punto de encuentro'), 'Parque principal')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(createServiceMock).toHaveBeenCalledTimes(1)
    const fd = createServiceMock.mock.calls[0][0] as FormData
    expect(fd.get('business_id')).toBe(BIZ_ID)
    expect(fd.get('service_type_id')).toBe('type-tour')
    expect(fd.get('name')).toBe('Tour por el río')
    expect(fd.get('base_price')).toBe('50000')
    expect(fd.get('capacity')).toBe('10')
    expect(fd.get('attr_duration_minutes')).toBe('90')
    expect(fd.get('attr_meeting_point')).toBe('Parque principal')
  })

  it('shows the server-returned error message as a toast', async () => {
    createServiceMock.mockResolvedValue({ error: 'Nombre y precio son requeridos. El precio no puede ser negativo.' })
    const user = userEvent.setup()
    render(<CreateServiceForm businessId={BIZ_ID} serviceTypes={SERVICE_TYPES} />)

    await user.click(screen.getByRole('radio', { name: 'Tour / actividad' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Nombre y precio son requeridos. El precio no puede ser negativo.',
      ),
    )
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    createServiceMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<CreateServiceForm businessId={BIZ_ID} serviceTypes={SERVICE_TYPES} />)

    await user.click(screen.getByRole('radio', { name: 'Tour / actividad' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled()

    resolveAction(undefined)
  })
})
