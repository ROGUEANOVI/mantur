import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import ManualPackageSaleForm, { type PackageOption } from './ManualPackageSaleForm'

const createManualPackageSaleMock = vi.fn()
const searchTouristsMock = vi.fn()

vi.mock('@/app/(app)/admin/reservas/actions', () => ({
  createManualPackageSale: (formData: FormData) => createManualPackageSaleMock(formData),
  searchTourists: (q: string) => searchTouristsMock(q),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const PACKAGES: PackageOption[] = [
  { id: 'pkg-1', name: 'FullDay Manaure', base_price: '280000.00', pricing_unit: 'fixed', capacity: null, tiers: [] },
  {
    id: 'pkg-2',
    name: 'Cascada el Chorro de la Vela',
    base_price: 150000,
    pricing_unit: 'per_person',
    capacity: 10,
    tiers: [],
  },
  {
    id: 'pkg-3',
    name: 'Casa de Campo',
    base_price: 182500,
    pricing_unit: 'per_person',
    capacity: 12,
    tiers: [
      { min_people: 6, max_people: 6, amount: 1470000, amount_basis: 'per_group' },
      { min_people: 8, max_people: 8, amount: 1712000, amount_basis: 'per_group' },
    ],
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  searchTouristsMock.mockResolvedValue([])
})

async function pickPackage(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.selectOptions(screen.getByLabelText('Paquete'), screen.getByRole('option', { name }))
}

describe('ManualPackageSaleForm', () => {
  it('defaults to a guest customer and keeps submit disabled until a package is picked', () => {
    render(<ManualPackageSaleForm packages={PACKAGES} />)
    expect(screen.getByLabelText('Nombre completo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar reserva' })).toBeDisabled()
  })

  it('switches to the registered-tourist search', async () => {
    const user = userEvent.setup()
    render(<ManualPackageSaleForm packages={PACKAGES} />)

    await user.click(screen.getByLabelText('Turista registrado'))

    expect(screen.queryByLabelText('Nombre completo')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Busca por nombre o teléfono...')).toBeInTheDocument()
  })

  it('previews the catalog total for the selected package and quantity', async () => {
    const user = userEvent.setup()
    render(<ManualPackageSaleForm packages={PACKAGES} />)

    await pickPackage(user, 'Cascada el Chorro de la Vela')
    const quantity = screen.getByRole('spinbutton', { name: /personas/i })
    await user.tripleClick(quantity)
    await user.keyboard('3')

    expect(screen.getByText('$450.000 COP')).toBeInTheDocument()
  })

  it('shows the agreed-total fields only when the override box is checked', async () => {
    const user = userEvent.setup()
    render(<ManualPackageSaleForm packages={PACKAGES} />)
    await pickPackage(user, 'FullDay Manaure')

    expect(screen.queryByLabelText('Total acordado (COP)')).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('Precio acordado distinto al de catálogo'))
    expect(screen.getByLabelText('Total acordado (COP)')).toBeInTheDocument()
    expect(screen.getByLabelText('Motivo del precio acordado')).toBeInTheDocument()
  })

  it('shows payment fields only for a paid sale', async () => {
    const user = userEvent.setup()
    render(<ManualPackageSaleForm packages={PACKAGES} />)
    await pickPackage(user, 'FullDay Manaure')

    expect(screen.getByLabelText('Método de pago')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '— Selecciona un método de pago —' })).toBeInTheDocument()

    await user.click(screen.getByLabelText('Pago pendiente'))
    expect(screen.queryByLabelText('Método de pago')).not.toBeInTheDocument()
    expect(
      screen.getByText('Quedará en Solicitudes de paquetes para marcarla como pagada cuando llegue el pago.'),
    ).toBeInTheDocument()
  })

  it('submits the guest sale fields and toasts success', async () => {
    createManualPackageSaleMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<ManualPackageSaleForm packages={PACKAGES} />)

    await user.type(screen.getByLabelText('Nombre completo'), 'Ana Pérez')
    await user.type(screen.getByLabelText('Teléfono (WhatsApp)'), '3001234567')
    await pickPackage(user, 'FullDay Manaure')
    await user.selectOptions(screen.getByLabelText('Método de pago'), 'nequi_daviplata')
    await user.click(screen.getByRole('button', { name: 'Registrar reserva' }))

    await waitFor(() => expect(createManualPackageSaleMock).toHaveBeenCalledTimes(1))
    const fd = createManualPackageSaleMock.mock.calls[0][0] as FormData
    expect(fd.get('customer_mode')).toBe('guest')
    expect(fd.get('package_id')).toBe('pkg-1')
    expect(fd.get('guest_full_name')).toBe('Ana Pérez')
    expect(fd.get('payment_status')).toBe('paid')
    expect(fd.get('payment_method')).toBe('nequi_daviplata')
    // The form never sends an amount of its own unless the override is on.
    expect(fd.get('agreed_total')).toBeNull()
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Venta registrada.'))
  })

  it('shows the server error as a toast', async () => {
    createManualPackageSaleMock.mockResolvedValue({ error: 'El teléfono debe ser un celular colombiano de 10 dígitos.' })
    const user = userEvent.setup()
    render(<ManualPackageSaleForm packages={PACKAGES} />)

    await pickPackage(user, 'FullDay Manaure')
    await user.click(screen.getByRole('button', { name: 'Registrar reserva' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('El teléfono debe ser un celular colombiano de 10 dígitos.'),
    )
  })
})

describe('ManualPackageSaleForm — group fares', () => {
  it('previews the tier total for a covered group size', async () => {
    const user = userEvent.setup()
    render(<ManualPackageSaleForm packages={PACKAGES} />)

    await pickPackage(user, 'Casa de Campo')
    const quantity = screen.getByRole('spinbutton', { name: /personas/i })
    await user.tripleClick(quantity)
    await user.keyboard('8')

    expect(screen.getByText('$1.712.000 COP')).toBeInTheDocument()
  })

  it('forces the agreed total when no fare covers the group size', async () => {
    const user = userEvent.setup()
    render(<ManualPackageSaleForm packages={PACKAGES} />)

    await pickPackage(user, 'Casa de Campo')
    const quantity = screen.getByRole('spinbutton', { name: /personas/i })
    await user.tripleClick(quantity)
    await user.keyboard('7')

    expect(screen.getByText('Sin tarifa publicada')).toBeInTheDocument()
    expect(screen.queryByLabelText('Precio acordado distinto al de catálogo')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Total acordado (COP)')).toBeInTheDocument()
    expect(screen.getByLabelText('Motivo del precio acordado')).toBeInTheDocument()
  })
})
