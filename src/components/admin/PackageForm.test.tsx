import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PackageForm from './PackageForm'

const PACKAGE = {
  id: '77777777-7777-7777-7777-777777777777',
  name: 'Ruta Serranía del Perijá',
  description: 'Dos días de caminata y hospedaje.',
  base_price: 450000,
  pricing_unit: 'per_person',
  capacity: 10,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PackageForm', () => {
  it('renders no hidden packageId field in create mode', () => {
    const { container } = render(<PackageForm action={vi.fn()} />)
    expect(container.querySelector('input[name="packageId"]')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nombre', { exact: false })).toHaveValue('')
  })

  it('renders a hidden packageId and prefills every field in edit mode', () => {
    const { container } = render(<PackageForm action={vi.fn()} package={PACKAGE} />)

    expect(container.querySelector('input[name="packageId"]')).toHaveValue(PACKAGE.id)
    expect(screen.getByLabelText('Nombre', { exact: false })).toHaveValue('Ruta Serranía del Perijá')
    expect(screen.getByLabelText('Descripción')).toHaveValue('Dos días de caminata y hospedaje.')
    expect(screen.getByLabelText('Precio de venta al turista (COP)', { exact: false })).toHaveValue(450000)
    expect(screen.getByLabelText('Se cobra', { exact: false })).toHaveValue('per_person')
    expect(screen.getByLabelText('Cupo máximo (opcional)')).toHaveValue(10)
  })

  it('falls back to empty values for null description/capacity in edit mode', () => {
    render(<PackageForm action={vi.fn()} package={{ ...PACKAGE, description: null, capacity: null }} />)
    expect(screen.getByLabelText('Descripción')).toHaveValue('')
    expect(screen.getByLabelText('Cupo máximo (opcional)')).toHaveValue(null)
  })

  it('submits the entered fields to the action prop', async () => {
    const action = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<PackageForm action={action} />)

    await user.type(screen.getByLabelText('Nombre', { exact: false }), 'Combo Chorro de la Vela')
    await user.type(screen.getByLabelText('Precio de venta al turista (COP)', { exact: false }), '180000')
    await user.selectOptions(screen.getByLabelText('Se cobra', { exact: false }), 'fixed')
    await user.click(screen.getByRole('button', { name: 'Guardar paquete' }))

    expect(action).toHaveBeenCalledTimes(1)
    const fd = action.mock.calls[0][0] as FormData
    expect(fd.get('name')).toBe('Combo Chorro de la Vela')
    expect(fd.get('base_price')).toBe('180000')
    expect(fd.get('pricing_unit')).toBe('fixed')
    expect(fd.get('packageId')).toBeNull()
  })

  it('submits the packageId when editing', async () => {
    const action = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<PackageForm action={action} package={PACKAGE} />)

    await user.click(screen.getByRole('button', { name: 'Guardar paquete' }))

    const fd = action.mock.calls[0][0] as FormData
    expect(fd.get('packageId')).toBe(PACKAGE.id)
  })

  it('shows the server-returned error message', async () => {
    const action = vi.fn().mockResolvedValue({ error: 'El precio de venta debe ser un número válido.' })
    const user = userEvent.setup()
    render(<PackageForm action={action} package={PACKAGE} />)

    await user.click(screen.getByRole('button', { name: 'Guardar paquete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El precio de venta debe ser un número válido.')
  })

  it('renders a cancel link back to the packages list', () => {
    render(<PackageForm action={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Cancelar' })).toHaveAttribute('href', '/admin/paquetes')
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    const action = vi.fn().mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<PackageForm action={action} package={PACKAGE} />)

    await user.click(screen.getByRole('button', { name: 'Guardar paquete' }))

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled()

    resolveAction(undefined)
  })
})
