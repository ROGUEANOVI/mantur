import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import LugarForm from './LugarForm'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('@/components/shared/LocationPicker', () => ({
  default: ({ defaultLat, defaultLng }: { defaultLat: number | null; defaultLng: number | null }) => (
    <>
      <input type="hidden" name="lat" value={defaultLat ?? ''} />
      <input type="hidden" name="lng" value={defaultLng ?? ''} />
    </>
  ),
}))

const PLACE = {
  id: '66666666-6666-6666-6666-666666666666',
  name: 'Pozo Azul',
  description: 'Un pozo natural',
  type: 'river',
  lat: 11.7808,
  lng: -72.9944,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LugarForm', () => {
  it('renders no hidden placeId field in create mode', () => {
    const { container } = render(<LugarForm action={vi.fn()} />)
    expect(container.querySelector('input[name="placeId"]')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nombre', { exact: false })).toHaveValue('')
  })

  it('renders a hidden placeId and prefills every field in edit mode', () => {
    const { container } = render(<LugarForm action={vi.fn()} place={PLACE} />)

    expect(container.querySelector('input[name="placeId"]')).toHaveValue(PLACE.id)
    expect(screen.getByLabelText('Nombre', { exact: false })).toHaveValue('Pozo Azul')
    expect(screen.getByLabelText('Descripción')).toHaveValue('Un pozo natural')
    expect(screen.getByLabelText('Tipo', { exact: false })).toHaveValue('river')
    expect(container.querySelector('input[name="lat"]')).toHaveValue('11.7808')
    expect(container.querySelector('input[name="lng"]')).toHaveValue('-72.9944')
  })

  it('falls back to empty strings for null description/lat/lng in edit mode', () => {
    const { container } = render(
      <LugarForm
        action={vi.fn()}
        place={{ ...PLACE, description: null, lat: null, lng: null }}
      />,
    )

    expect(screen.getByLabelText('Descripción')).toHaveValue('')
    expect(container.querySelector('input[name="lat"]')).toHaveValue('')
    expect(container.querySelector('input[name="lng"]')).toHaveValue('')
  })

  it('submits the entered fields to the action prop', async () => {
    const action = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<LugarForm action={action} />)

    await user.type(screen.getByLabelText('Nombre', { exact: false }), 'Cascada Escondida')
    await user.selectOptions(screen.getByLabelText('Tipo', { exact: false }), 'waterfall')
    await user.click(screen.getByRole('button', { name: 'Guardar lugar' }))

    expect(action).toHaveBeenCalledTimes(1)
    const fd = action.mock.calls[0][0] as FormData
    expect(fd.get('name')).toBe('Cascada Escondida')
    expect(fd.get('type')).toBe('waterfall')
    expect(fd.get('placeId')).toBeNull()
  })

  it('submits the placeId when editing', async () => {
    const action = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<LugarForm action={action} place={PLACE} />)

    await user.click(screen.getByRole('button', { name: 'Guardar lugar' }))

    const fd = action.mock.calls[0][0] as FormData
    expect(fd.get('placeId')).toBe(PLACE.id)
  })

  it('shows the server-returned error message as a toast', async () => {
    const action = vi.fn().mockResolvedValue({ error: 'Las coordenadas deben ser números válidos.' })
    const user = userEvent.setup()
    render(<LugarForm action={action} place={PLACE} />)

    await user.click(screen.getByRole('button', { name: 'Guardar lugar' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Las coordenadas deben ser números válidos.'))
  })

  it('renders a cancel link back to the places list', () => {
    render(<LugarForm action={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Cancelar' })).toHaveAttribute('href', '/admin/lugares')
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    const action = vi.fn().mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<LugarForm action={action} place={PLACE} />)

    await user.click(screen.getByRole('button', { name: 'Guardar lugar' }))

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled()

    resolveAction(undefined)
  })
})
