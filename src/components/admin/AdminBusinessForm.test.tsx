import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import AdminBusinessForm from './AdminBusinessForm'

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

const OWNERS = [
  { id: 'owner-1', full_name: 'Ana Pérez' },
  { id: 'owner-2', full_name: null },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AdminBusinessForm', () => {
  it('shows the empty-owners message and disables submit when there are no owners', () => {
    const action = vi.fn()
    render(<AdminBusinessForm action={action} owners={[]} />)

    expect(screen.getByText('No hay usuarios con rol business_owner registrados.')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Propietario' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear negocio' })).toBeDisabled()
  })

  it('renders one option per owner, falling back to the id when full_name is null', () => {
    render(<AdminBusinessForm action={vi.fn()} owners={OWNERS} />)

    const select = screen.getByLabelText('Propietario') as HTMLSelectElement
    const optionLabels = Array.from(select.options).map((o) => o.textContent)
    expect(optionLabels).toContain('Ana Pérez')
    expect(optionLabels).toContain('owner-2')
  })

  it('submits name/type/ownerId/description/address/phone to the action prop', async () => {
    const action = vi.fn().mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<AdminBusinessForm action={action} owners={OWNERS} />)

    await user.type(screen.getByLabelText('Nombre del negocio'), 'Finca La Esperanza')
    await user.selectOptions(screen.getByLabelText('Tipo'), 'restaurant')
    await user.selectOptions(screen.getByLabelText('Propietario'), 'owner-1')
    await user.type(screen.getByLabelText('Descripción'), 'Un lugar agradable')
    await user.type(screen.getByLabelText('Dirección'), 'Calle 5 #10-20')
    await user.type(screen.getByLabelText('Teléfono'), '3001234567')
    await user.click(screen.getByRole('button', { name: 'Crear negocio' }))

    expect(action).toHaveBeenCalledTimes(1)
    const fd = action.mock.calls[0][0] as FormData
    expect(fd.get('name')).toBe('Finca La Esperanza')
    expect(fd.get('type')).toBe('restaurant')
    expect(fd.get('ownerId')).toBe('owner-1')
    expect(fd.get('description')).toBe('Un lugar agradable')
    expect(fd.get('address')).toBe('Calle 5 #10-20')
    expect(fd.get('phone')).toBe('3001234567')
  })

  it('shows a success toast when the action succeeds', async () => {
    const action = vi.fn().mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<AdminBusinessForm action={action} owners={OWNERS} />)

    await user.type(screen.getByLabelText('Nombre del negocio'), 'Finca X')
    await user.selectOptions(screen.getByLabelText('Tipo'), 'farm')
    await user.selectOptions(screen.getByLabelText('Propietario'), 'owner-1')
    await user.click(screen.getByRole('button', { name: 'Crear negocio' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Negocio creado correctamente.'))
  })

  it('shows the server-returned error message as a toast', async () => {
    // Simulates a server-side rejection (e.g. duplicate/invalid data) on an
    // otherwise client-valid submission — the client `required` attributes
    // don't guarantee server acceptance.
    const action = vi.fn().mockResolvedValue({ error: 'Error al crear el negocio. Intenta de nuevo.' })
    const user = userEvent.setup()
    render(<AdminBusinessForm action={action} owners={OWNERS} />)

    await user.type(screen.getByLabelText('Nombre del negocio'), 'Finca X')
    await user.selectOptions(screen.getByLabelText('Tipo'), 'farm')
    await user.selectOptions(screen.getByLabelText('Propietario'), 'owner-1')
    await user.click(screen.getByRole('button', { name: 'Crear negocio' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Error al crear el negocio. Intenta de nuevo.'))
  })

  it('does not show a toast when the action resolves with no value', async () => {
    const action = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<AdminBusinessForm action={action} owners={OWNERS} />)

    await user.type(screen.getByLabelText('Nombre del negocio'), 'Finca X')
    await user.selectOptions(screen.getByLabelText('Tipo'), 'farm')
    await user.selectOptions(screen.getByLabelText('Propietario'), 'owner-1')
    await user.click(screen.getByRole('button', { name: 'Crear negocio' }))

    await waitFor(() => expect(action).toHaveBeenCalled())
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('renders a cancel link back to the business list', () => {
    render(<AdminBusinessForm action={vi.fn()} owners={OWNERS} />)
    expect(screen.getByRole('link', { name: 'Cancelar' })).toHaveAttribute('href', '/admin/negocios')
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    const action = vi.fn().mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<AdminBusinessForm action={action} owners={OWNERS} />)

    await user.type(screen.getByLabelText('Nombre del negocio'), 'Finca X')
    await user.selectOptions(screen.getByLabelText('Tipo'), 'farm')
    await user.selectOptions(screen.getByLabelText('Propietario'), 'owner-1')
    await user.click(screen.getByRole('button', { name: 'Crear negocio' }))

    expect(await screen.findByRole('button', { name: 'Creando...' })).toBeDisabled()

    resolveAction({ success: true })
  })

  it('shows an inline error on blur for an invalid phone, without calling the action', async () => {
    const action = vi.fn()
    const user = userEvent.setup()
    render(<AdminBusinessForm action={action} owners={OWNERS} />)

    await user.type(screen.getByLabelText('Teléfono'), 'abcdefgh')
    await user.tab()

    expect(
      await screen.findByText('Escribe un número de celular colombiano válido (10 dígitos, ej: 300 123 4567).'),
    ).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nombre del negocio'), 'Finca X')
    await user.selectOptions(screen.getByLabelText('Tipo'), 'farm')
    await user.selectOptions(screen.getByLabelText('Propietario'), 'owner-1')
    await user.click(screen.getByRole('button', { name: 'Crear negocio' }))

    expect(action).not.toHaveBeenCalled()
  })
})
