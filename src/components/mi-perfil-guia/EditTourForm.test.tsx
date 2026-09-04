import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import EditTourForm from './EditTourForm'

const updateGuideTourMock = vi.fn()

vi.mock('@/app/(app)/mi-perfil-guia/actions', () => ({
  updateGuideTour: (...args: unknown[]) => updateGuideTourMock(...args),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const TOUR_ID = '22222222-2222-2222-2222-222222222222'

const DEFAULT_VALUES = {
  name: 'Caminata al mirador',
  description: 'Una caminata guiada',
  price: 50000,
  capacity: 8,
  duration_minutes: 120,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('EditTourForm', () => {
  it('pre-populates every field from defaultValues', () => {
    render(<EditTourForm tourId={TOUR_ID} defaultValues={DEFAULT_VALUES} />)

    expect(screen.getByLabelText('Nombre del tour')).toHaveValue('Caminata al mirador')
    expect(screen.getByLabelText('Descripción')).toHaveValue('Una caminata guiada')
    expect(screen.getByLabelText('Precio por persona (COP)')).toHaveValue(50000)
    expect(screen.getByLabelText('Capacidad máxima de personas')).toHaveValue(8)
    expect(screen.getByLabelText('Duración (minutos)')).toHaveValue(120)
  })

  it('renders an empty description and duration when those defaults are null', () => {
    render(
      <EditTourForm
        tourId={TOUR_ID}
        defaultValues={{ ...DEFAULT_VALUES, description: null, duration_minutes: null }}
      />,
    )

    expect(screen.getByLabelText('Descripción')).toHaveValue('')
    expect(screen.getByLabelText('Duración (minutos)')).toHaveValue(null)
  })

  it('submits the updated fields scoped to the tourId', async () => {
    updateGuideTourMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<EditTourForm tourId={TOUR_ID} defaultValues={DEFAULT_VALUES} />)

    await user.clear(screen.getByLabelText('Precio por persona (COP)'))
    await user.type(screen.getByLabelText('Precio por persona (COP)'), '60000')
    await user.click(screen.getByRole('button', { name: 'Guardar tour' }))

    expect(updateGuideTourMock).toHaveBeenCalledTimes(1)
    const [calledTourId, fd] = updateGuideTourMock.mock.calls[0] as [string, FormData]
    expect(calledTourId).toBe(TOUR_ID)
    expect(fd.get('price')).toBe('60000')
  })

  it('shows a success toast and no error toast after a successful save', async () => {
    updateGuideTourMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<EditTourForm tourId={TOUR_ID} defaultValues={DEFAULT_VALUES} />)

    await user.click(screen.getByRole('button', { name: 'Guardar tour' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Cambios guardados.'))
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('shows an error toast and no success toast when the save fails', async () => {
    updateGuideTourMock.mockResolvedValue({ error: 'Ocurrió un error. Intenta de nuevo.' })
    const user = userEvent.setup()
    render(<EditTourForm tourId={TOUR_ID} defaultValues={DEFAULT_VALUES} />)

    await user.click(screen.getByRole('button', { name: 'Guardar tour' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Ocurrió un error. Intenta de nuevo.'))
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('shows neither toast before submission', () => {
    render(<EditTourForm tourId={TOUR_ID} defaultValues={DEFAULT_VALUES} />)
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    updateGuideTourMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<EditTourForm tourId={TOUR_ID} defaultValues={DEFAULT_VALUES} />)

    await user.click(screen.getByRole('button', { name: 'Guardar tour' }))

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled()

    resolveAction({ success: true })
  })
})
