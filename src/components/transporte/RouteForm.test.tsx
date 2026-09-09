import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import RouteForm from './RouteForm'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^origen/i), 'Casco urbano de Manaure')
  await user.type(screen.getByLabelText(/^destino/i), 'Balneario El Edén')
}

describe('RouteForm', () => {
  it('defaults to "solo ida" checked and "ida y vuelta" unchecked for a new route', () => {
    render(<RouteForm action={vi.fn()} />)
    expect(screen.getByLabelText('Solo ida')).toBeChecked()
    expect(screen.getByLabelText('Ida y vuelta')).not.toBeChecked()
  })

  it('only shows the price field for a checked modality', async () => {
    const user = userEvent.setup()
    render(<RouteForm action={vi.fn()} />)

    expect(screen.getByLabelText(/precio ida \(/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/precio ida y vuelta/i)).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('Ida y vuelta'))
    expect(screen.getByLabelText(/precio ida y vuelta/i)).toBeInTheDocument()

    await user.click(screen.getByLabelText('Solo ida'))
    expect(screen.queryByLabelText(/precio ida \(/i)).not.toBeInTheDocument()
  })

  it('submits origin, destination, and the checked modalities', async () => {
    const actionMock = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<RouteForm action={actionMock} />)

    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: 'Guardar ruta' }))

    expect(actionMock).toHaveBeenCalledTimes(1)
    const fd = actionMock.mock.calls[0][0] as FormData
    expect(fd.get('origin')).toBe('Casco urbano de Manaure')
    expect(fd.get('destination')).toBe('Balneario El Edén')
    expect(fd.get('allows_one_way')).toBe('on')
    expect(fd.get('allows_round_trip')).toBeNull()
  })

  it('pre-fills fields from initialValues, including a price converted from cents', () => {
    render(
      <RouteForm
        action={vi.fn()}
        initialValues={{
          origin: 'A',
          destination: 'B',
          allows_one_way: true,
          allows_round_trip: true,
          price_one_way_cents: 1_500_000,
          price_round_trip_cents: 2_500_000,
          estimated_duration_minutes: 20,
          notes: 'Nota existente',
        }}
      />,
    )

    expect(screen.getByLabelText(/^origen/i)).toHaveValue('A')
    expect(screen.getByLabelText(/precio ida \(/i)).toHaveValue(15000)
    expect(screen.getByLabelText(/precio ida y vuelta/i)).toHaveValue(25000)
    expect(screen.getByLabelText(/duración estimada/i)).toHaveValue(20)
    expect(screen.getByLabelText(/notas/i)).toHaveValue('Nota existente')
  })

  it('shows the server-returned error message as a toast', async () => {
    const actionMock = vi.fn().mockResolvedValue({ error: 'El origen y el destino son obligatorios.' })
    const user = userEvent.setup()
    render(<RouteForm action={actionMock} />)

    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: 'Guardar ruta' }))

    expect(toast.error).toHaveBeenCalledWith('El origen y el destino son obligatorios.')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('shows a success toast and navigates back to the routes list on success', async () => {
    const actionMock = vi.fn().mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<RouteForm action={actionMock} />)

    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: 'Guardar ruta' }))

    expect(toast.success).toHaveBeenCalledWith('Cambios guardados.')
    expect(pushMock).toHaveBeenCalledWith('/mi-perfil-transporte/rutas')
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    const actionMock = vi.fn().mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<RouteForm action={actionMock} />)

    await fillRequiredFields(user)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar ruta' }))

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled()

    resolveAction(undefined)
  })
})
