import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import PackageSolicitudCard from './PackageSolicitudCard'

const setProviderAvailabilityMock = vi.fn()
const confirmPackagePrereservaMock = vi.fn()
const cancelPackagePrereservaMock = vi.fn()
const markPackageBookingPaidMock = vi.fn()

vi.mock('@/app/(app)/admin/paquetes/solicitudes/actions', () => ({
  setProviderAvailability: (formData: FormData) => setProviderAvailabilityMock(formData),
  confirmPackagePrereserva: (formData: FormData) => confirmPackagePrereservaMock(formData),
  cancelPackagePrereserva: (formData: FormData) => cancelPackagePrereservaMock(formData),
  markPackageBookingPaid: (formData: FormData) => markPackageBookingPaidMock(formData),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

const BOOKING_ID = '11111111-1111-1111-1111-111111111111'

const ITEMS = [
  { id: 'item-1', label: 'Ecosenderismo — La Teresita Hostal', providerType: 'business' as const, providerId: 'biz-1', isUnavailable: false },
  { id: 'item-2', label: 'Chorro de la Vela — María Guía', providerType: 'guide' as const, providerId: 'guide-1', isUnavailable: true },
]

const BASE_PROPS = {
  bookingId: BOOKING_ID,
  packageName: 'Ruta Serranía del Perijá',
  touristName: 'Ana Pérez',
  touristPhone: '3001234567',
  bookingDate: '2026-09-10',
  quantity: 2,
  totalAmount: 200000,
  notes: null as string | null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PackageSolicitudCard — shared header', () => {
  it('renders the package name, tourist name, date, quantity, and total', () => {
    render(<PackageSolicitudCard {...BASE_PROPS} />)
    expect(screen.getByText('Ruta Serranía del Perijá')).toBeInTheDocument()
    expect(screen.getByText(/Ana Pérez/)).toBeInTheDocument()
    expect(screen.getByText(/10 de sept\.? de 2026/)).toBeInTheDocument()
    expect(screen.getByText(/\$\s?200[.,]000/)).toBeInTheDocument()
  })

  it('renders a WhatsApp link when the tourist has a phone', () => {
    render(<PackageSolicitudCard {...BASE_PROPS} />)
    const link = screen.getByRole('link', { name: 'Escribir por WhatsApp' })
    expect(link).toHaveAttribute('href', expect.stringContaining('https://wa.me/573217203264'))
  })

  it('omits the WhatsApp link when the tourist has no phone', () => {
    render(<PackageSolicitudCard {...BASE_PROPS} touristPhone={null} />)
    expect(screen.queryByRole('link', { name: 'Escribir por WhatsApp' })).not.toBeInTheDocument()
  })

  it('renders the notes block when notes is present', () => {
    render(<PackageSolicitudCard {...BASE_PROPS} notes="Llegamos en la tarde" />)
    expect(screen.getByText('Llegamos en la tarde')).toBeInTheDocument()
  })

  it('omits the notes block when notes is null', () => {
    render(<PackageSolicitudCard {...BASE_PROPS} />)
    expect(screen.queryByText(/Notas del turista/)).not.toBeInTheDocument()
  })
})

describe('PackageSolicitudCard — pending_availability stage (items provided)', () => {
  it('renders every provider item with its label', () => {
    render(<PackageSolicitudCard {...BASE_PROPS} items={ITEMS} />)
    expect(screen.getByText('Ecosenderismo — La Teresita Hostal')).toBeInTheDocument()
    expect(screen.getByText('Chorro de la Vela — María Guía')).toBeInTheDocument()
  })

  it('shows "Marcar no disponible" for an available item and no badge', () => {
    render(<PackageSolicitudCard {...BASE_PROPS} items={ITEMS} />)
    const row = screen.getByText('Ecosenderismo — La Teresita Hostal').closest('form') as HTMLElement
    expect(within(row).getByRole('button', { name: 'Marcar no disponible' })).toBeInTheDocument()
  })

  it('shows "Marcar disponible" and the unavailable badge for an unavailable item', () => {
    render(<PackageSolicitudCard {...BASE_PROPS} items={ITEMS} />)
    const row = screen.getByText('Chorro de la Vela — María Guía').closest('form') as HTMLElement
    expect(within(row).getByRole('button', { name: 'Marcar disponible' })).toBeInTheDocument()
    expect(within(row).getByText('No disponible')).toBeInTheDocument()
  })

  it('toggling an available item submits status=unavailable with the item\'s provider info', async () => {
    setProviderAvailabilityMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<PackageSolicitudCard {...BASE_PROPS} items={ITEMS} />)

    await user.click(screen.getByRole('button', { name: 'Marcar no disponible' }))

    expect(setProviderAvailabilityMock).toHaveBeenCalledTimes(1)
    const fd = setProviderAvailabilityMock.mock.calls[0][0] as FormData
    expect(fd.get('bookingId')).toBe(BOOKING_ID)
    expect(fd.get('providerType')).toBe('business')
    expect(fd.get('providerId')).toBe('biz-1')
    expect(fd.get('date')).toBe('2026-09-10')
    expect(fd.get('status')).toBe('unavailable')
  })

  it('toggling an unavailable item submits status=available', async () => {
    setProviderAvailabilityMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<PackageSolicitudCard {...BASE_PROPS} items={ITEMS} />)

    await user.click(screen.getByRole('button', { name: 'Marcar disponible' }))

    const fd = setProviderAvailabilityMock.mock.calls[0][0] as FormData
    expect(fd.get('providerType')).toBe('guide')
    expect(fd.get('providerId')).toBe('guide-1')
    expect(fd.get('status')).toBe('available')
  })

  it('shows a toast when a toggle fails', async () => {
    setProviderAvailabilityMock.mockResolvedValue({ error: 'Ocurrió un error. Intenta de nuevo.' })
    const user = userEvent.setup()
    render(<PackageSolicitudCard {...BASE_PROPS} items={ITEMS} />)

    await user.click(screen.getByRole('button', { name: 'Marcar no disponible' }))

    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Ocurrió un error. Intenta de nuevo.')
    })
  })

  it('submits the bookingId when "Confirmar y pasar a pago" is clicked', async () => {
    confirmPackagePrereservaMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<PackageSolicitudCard {...BASE_PROPS} items={ITEMS} />)

    await user.click(screen.getByRole('button', { name: 'Confirmar y pasar a pago' }))

    expect(confirmPackagePrereservaMock).toHaveBeenCalledTimes(1)
    const fd = confirmPackagePrereservaMock.mock.calls[0][0] as FormData
    expect(fd.get('bookingId')).toBe(BOOKING_ID)
  })

  it('shows a toast when confirming fails (e.g. provider still unavailable)', async () => {
    confirmPackagePrereservaMock.mockResolvedValue({ error: 'Aún hay proveedores marcados como no disponibles para esta fecha.' })
    const user = userEvent.setup()
    render(<PackageSolicitudCard {...BASE_PROPS} items={ITEMS} />)

    await user.click(screen.getByRole('button', { name: 'Confirmar y pasar a pago' }))

    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Aún hay proveedores marcados como no disponibles para esta fecha.')
    })
  })

  it('cancelling requires confirmation before submitting', async () => {
    cancelPackagePrereservaMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<PackageSolicitudCard {...BASE_PROPS} items={ITEMS} />)

    await user.click(screen.getByRole('button', { name: 'Cancelar solicitud' }))
    expect(cancelPackagePrereservaMock).not.toHaveBeenCalled()

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar solicitud' }))

    expect(cancelPackagePrereservaMock).toHaveBeenCalledTimes(1)
    const fd = cancelPackagePrereservaMock.mock.calls[0][0] as FormData
    expect(fd.get('bookingId')).toBe(BOOKING_ID)
  })
})

describe('PackageSolicitudCard — pending_payment stage (no items prop)', () => {
  it('does not render the provider items section', () => {
    render(<PackageSolicitudCard {...BASE_PROPS} />)
    expect(screen.queryByText('Proveedores del paquete')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirmar y pasar a pago' })).not.toBeInTheDocument()
  })

  it('renders the "Marcar como pagada" trigger', () => {
    render(<PackageSolicitudCard {...BASE_PROPS} />)
    expect(screen.getByRole('button', { name: 'Marcar como pagada' })).toBeInTheDocument()
  })
})
