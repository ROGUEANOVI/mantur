import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import EditServiceForm from './EditServiceForm'

const updateServiceMock = vi.fn()

vi.mock('@/app/(app)/mi-negocio/actions', () => ({
  updateService: (...args: unknown[]) => updateServiceMock(...args),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const SERVICE_ID = '22222222-2222-2222-2222-222222222222'

const DEFAULT_VALUES = {
  name: 'Tour por el río',
  description: 'Un paseo relajante',
  base_price: 45000,
  capacity: 10,
  attributes: { duration_minutes: 90, meeting_point: 'Parque principal' },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('EditServiceForm', () => {
  it('pre-populates the base fields from defaultValues', () => {
    render(
      <EditServiceForm
        serviceId={SERVICE_ID}
        serviceTypeName="Tour / actividad"
        serviceTypeSlug="tour_activity"
        pricingUnit="per_person"
        defaultValues={DEFAULT_VALUES}
      />,
    )

    expect(screen.getByLabelText('Nombre')).toHaveValue('Tour por el río')
    expect(screen.getByLabelText('Descripción')).toHaveValue('Un paseo relajante')
    expect(screen.getByLabelText('Precio por persona (COP)')).toHaveValue(45000)
    expect(screen.getByLabelText('Cupo máximo')).toHaveValue(10)
  })

  it('shows the service type name as read-only text, not an editable field', () => {
    render(
      <EditServiceForm
        serviceId={SERVICE_ID}
        serviceTypeName="Tour / actividad"
        serviceTypeSlug="tour_activity"
        pricingUnit="per_person"
        defaultValues={DEFAULT_VALUES}
      />,
    )

    expect(screen.getByText('Tour / actividad')).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /tipo de servicio/i })).not.toBeInTheDocument()
  })

  it('pre-fills the type\'s attribute fields from defaultValues.attributes', () => {
    render(
      <EditServiceForm
        serviceId={SERVICE_ID}
        serviceTypeName="Tour / actividad"
        serviceTypeSlug="tour_activity"
        pricingUnit="per_person"
        defaultValues={DEFAULT_VALUES}
      />,
    )

    expect(screen.getByLabelText('Duración (minutos)')).toHaveValue(90)
    expect(screen.getByLabelText('Punto de encuentro')).toHaveValue('Parque principal')
  })

  it('renders empty attribute fields when defaultValues.attributes has no value for that key', () => {
    render(
      <EditServiceForm
        serviceId={SERVICE_ID}
        serviceTypeName="Tour / actividad"
        serviceTypeSlug="tour_activity"
        pricingUnit="per_person"
        defaultValues={{ ...DEFAULT_VALUES, attributes: {} }}
      />,
    )

    expect(screen.getByLabelText('Duración (minutos)')).toHaveValue(null)
    expect(screen.getByLabelText('Punto de encuentro')).toHaveValue('')
  })

  it('renders an empty capacity input when the default is null', () => {
    render(
      <EditServiceForm
        serviceId={SERVICE_ID}
        serviceTypeName="Tour / actividad"
        serviceTypeSlug="tour_activity"
        pricingUnit="per_person"
        defaultValues={{ ...DEFAULT_VALUES, capacity: null }}
      />,
    )

    expect(screen.getByLabelText('Cupo máximo')).toHaveValue(null)
  })

  it('renders an empty description textarea when the default is null', () => {
    render(
      <EditServiceForm
        serviceId={SERVICE_ID}
        serviceTypeName="Tour / actividad"
        serviceTypeSlug="tour_activity"
        pricingUnit="per_person"
        defaultValues={{ ...DEFAULT_VALUES, description: null }}
      />,
    )

    expect(screen.getByLabelText('Descripción')).toHaveValue('')
  })

  it('submits the updated fields scoped to the serviceId', async () => {
    updateServiceMock.mockResolvedValue({ saved: true })
    const user = userEvent.setup()
    render(
      <EditServiceForm
        serviceId={SERVICE_ID}
        serviceTypeName="Tour / actividad"
        serviceTypeSlug="tour_activity"
        pricingUnit="per_person"
        defaultValues={DEFAULT_VALUES}
      />,
    )

    await user.clear(screen.getByLabelText('Precio por persona (COP)'))
    await user.type(screen.getByLabelText('Precio por persona (COP)'), '60000')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(updateServiceMock).toHaveBeenCalledTimes(1)
    const [calledServiceId, fd] = updateServiceMock.mock.calls[0] as [string, FormData]
    expect(calledServiceId).toBe(SERVICE_ID)
    expect(fd.get('base_price')).toBe('60000')
  })

  it('shows a success toast and no error toast after a successful save', async () => {
    updateServiceMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <EditServiceForm
        serviceId={SERVICE_ID}
        serviceTypeName="Tour / actividad"
        serviceTypeSlug="tour_activity"
        pricingUnit="per_person"
        defaultValues={DEFAULT_VALUES}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Cambios guardados.'))
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('shows an error toast and no success toast when the save fails', async () => {
    updateServiceMock.mockResolvedValue({ error: 'No se pudo actualizar el servicio. Intenta de nuevo.' })
    const user = userEvent.setup()
    render(
      <EditServiceForm
        serviceId={SERVICE_ID}
        serviceTypeName="Tour / actividad"
        serviceTypeSlug="tour_activity"
        pricingUnit="per_person"
        defaultValues={DEFAULT_VALUES}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('No se pudo actualizar el servicio. Intenta de nuevo.'),
    )
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('shows neither toast before submission', () => {
    render(
      <EditServiceForm
        serviceId={SERVICE_ID}
        serviceTypeName="Tour / actividad"
        serviceTypeSlug="tour_activity"
        pricingUnit="per_person"
        defaultValues={DEFAULT_VALUES}
      />,
    )
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    updateServiceMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(
      <EditServiceForm
        serviceId={SERVICE_ID}
        serviceTypeName="Tour / actividad"
        serviceTypeSlug="tour_activity"
        pricingUnit="per_person"
        defaultValues={DEFAULT_VALUES}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled()

    resolveAction(undefined)
  })
})
