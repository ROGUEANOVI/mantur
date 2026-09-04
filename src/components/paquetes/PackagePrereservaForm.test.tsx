import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import PackagePrereservaForm from './PackagePrereservaForm'

const createPackagePrereservaMock = vi.fn()

vi.mock('@/app/(app)/reservas/actions', () => ({
  createPackagePrereserva: (formData: FormData) => createPackagePrereservaMock(formData),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const PACKAGE_ID = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PackagePrereservaForm — access gate', () => {
  it('renders nothing for other_role', () => {
    const { container } = render(
      <PackagePrereservaForm packageId={PACKAGE_ID} price={50000} capacity={10} pricingUnit="per_person" access="other_role" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a login link for guest', () => {
    render(
      <PackagePrereservaForm packageId={PACKAGE_ID} price={50000} capacity={10} pricingUnit="per_person" access="guest" />,
    )
    expect(screen.getByRole('link', { name: 'Inicia sesión para solicitar este paquete' })).toHaveAttribute(
      'href',
      '/login',
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders the real form for tourist', () => {
    render(
      <PackagePrereservaForm packageId={PACKAGE_ID} price={50000} capacity={10} pricingUnit="per_person" access="tourist" />,
    )
    expect(screen.getByRole('button', { name: 'Solicitar disponibilidad' })).toBeInTheDocument()
  })
})

describe('PackagePrereservaForm — form fields', () => {
  it('includes the packageId as a hidden field', () => {
    const { container } = render(
      <PackagePrereservaForm packageId={PACKAGE_ID} price={50000} capacity={10} pricingUnit="per_person" access="tourist" />,
    )
    expect(container.querySelector('input[type="hidden"][name="package_id"]')).toHaveValue(PACKAGE_ID)
  })

  it('starts with 1 unit and shows the total for that quantity', () => {
    render(
      <PackagePrereservaForm packageId={PACKAGE_ID} price={50000} capacity={10} pricingUnit="per_person" access="tourist" />,
    )
    expect(screen.getByLabelText('Número de personas')).toHaveValue(1)
    expect(screen.getByText('$50.000 COP')).toBeInTheDocument()
  })

  it('updates the live total when the quantity changes', () => {
    render(
      <PackagePrereservaForm packageId={PACKAGE_ID} price={50000} capacity={10} pricingUnit="per_person" access="tourist" />,
    )
    const input = screen.getByLabelText('Número de personas')
    fireEvent.change(input, { target: { value: '3' } })
    expect(input).toHaveValue(3)
    expect(screen.getByText('$150.000 COP')).toBeInTheDocument()
  })

  it('caps the entered quantity at the package capacity', () => {
    render(
      <PackagePrereservaForm packageId={PACKAGE_ID} price={50000} capacity={4} pricingUnit="per_person" access="tourist" />,
    )
    const input = screen.getByLabelText('Número de personas')
    fireEvent.change(input, { target: { value: '9' } })
    expect(input).toHaveValue(4)
  })

  it('allows any quantity when capacity is null (no cap)', () => {
    render(
      <PackagePrereservaForm packageId={PACKAGE_ID} price={1000} capacity={null} pricingUnit="per_person" access="tourist" />,
    )
    const input = screen.getByLabelText('Número de personas')
    fireEvent.change(input, { target: { value: '500' } })
    expect(input).toHaveValue(500)
  })

  it('submits the booking date, quantity, notes, and hidden package_id', async () => {
    createPackagePrereservaMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    const { container } = render(
      <PackagePrereservaForm packageId={PACKAGE_ID} price={50000} capacity={10} pricingUnit="per_person" access="tourist" />,
    )

    const dateInput = container.querySelector('input[name="booking_date"]') as HTMLInputElement
    await user.type(dateInput, dateInput.min)
    await user.type(screen.getByLabelText('Notas (opcional)'), 'Llegamos en la tarde')
    await user.click(screen.getByRole('button', { name: 'Solicitar disponibilidad' }))

    expect(createPackagePrereservaMock).toHaveBeenCalledTimes(1)
    const fd = createPackagePrereservaMock.mock.calls[0][0] as FormData
    expect(fd.get('package_id')).toBe(PACKAGE_ID)
    expect(fd.get('quantity')).toBe('1')
    expect(fd.get('notes')).toBe('Llegamos en la tarde')
  })

  it('shows the server-returned error message as a toast', async () => {
    createPackagePrereservaMock.mockResolvedValue({ error: 'Supera el cupo máximo disponible.' })
    const user = userEvent.setup()
    render(
      <PackagePrereservaForm packageId={PACKAGE_ID} price={50000} capacity={10} pricingUnit="per_person" access="tourist" />,
    )

    await user.click(screen.getByRole('button', { name: 'Solicitar disponibilidad' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Supera el cupo máximo disponible.'))
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    createPackagePrereservaMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(
      <PackagePrereservaForm packageId={PACKAGE_ID} price={50000} capacity={10} pricingUnit="per_person" access="tourist" />,
    )

    await user.click(screen.getByRole('button', { name: 'Solicitar disponibilidad' }))

    expect(await screen.findByRole('button', { name: 'Enviando solicitud...' })).toBeDisabled()

    resolveAction(undefined)
  })

  it('shows the "por noche" quantity label for a per_night package', () => {
    render(
      <PackagePrereservaForm packageId={PACKAGE_ID} price={80000} capacity={5} pricingUnit="per_night" access="tourist" />,
    )
    expect(screen.getByLabelText('Número de noches')).toBeInTheDocument()
    expect(screen.getByText('$80.000 × 1 por noche')).toBeInTheDocument()
  })

  describe('pricingUnit "fixed"', () => {
    it('shows the total as the flat price with no multiplication', () => {
      render(
        <PackagePrereservaForm packageId={PACKAGE_ID} price={300000} capacity={20} pricingUnit="fixed" access="tourist" />,
      )
      expect(screen.getByText('$300.000 COP')).toBeInTheDocument()
      expect(screen.getByText('precio fijo')).toBeInTheDocument()
    })

    it('keeps the total constant regardless of quantity changes', () => {
      render(
        <PackagePrereservaForm packageId={PACKAGE_ID} price={300000} capacity={20} pricingUnit="fixed" access="tourist" />,
      )
      const input = screen.getByLabelText('Cantidad')
      fireEvent.change(input, { target: { value: '5' } })
      expect(input).toHaveValue(5)
      expect(screen.getByText('$300.000 COP')).toBeInTheDocument()
    })
  })
})
