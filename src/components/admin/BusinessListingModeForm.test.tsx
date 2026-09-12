import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import BusinessListingModeForm from './BusinessListingModeForm'

const setBusinessListingModeOverrideMock = vi.fn()

vi.mock('@/app/(app)/admin/actions', () => ({
  setBusinessListingModeOverride: (formData: FormData) => setBusinessListingModeOverrideMock(formData),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const BUSINESS_ID = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BusinessListingModeForm', () => {
  it('defaults to "Heredar de categoría" when there is no override', () => {
    render(<BusinessListingModeForm businessId={BUSINESS_ID} currentOverride={null} />)
    expect(screen.getByLabelText('Modo de listado')).toHaveValue('')
  })

  it('renders the current override as selected', () => {
    render(<BusinessListingModeForm businessId={BUSINESS_ID} currentOverride="informational" />)
    expect(screen.getByLabelText('Modo de listado')).toHaveValue('informational')
  })

  it('submits businessId and the selected override', async () => {
    setBusinessListingModeOverrideMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<BusinessListingModeForm businessId={BUSINESS_ID} currentOverride={null} />)

    await user.selectOptions(screen.getByLabelText('Modo de listado'), 'bookable')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(setBusinessListingModeOverrideMock).toHaveBeenCalledTimes(1)
    const fd = setBusinessListingModeOverrideMock.mock.calls[0][0] as FormData
    expect(fd.get('businessId')).toBe(BUSINESS_ID)
    expect(fd.get('listingModeOverride')).toBe('bookable')
  })

  it('shows a success toast after a successful save', async () => {
    setBusinessListingModeOverrideMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<BusinessListingModeForm businessId={BUSINESS_ID} currentOverride={null} />)

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Modo de listado actualizado.'))
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('shows the server-returned error message as a toast', async () => {
    setBusinessListingModeOverrideMock.mockResolvedValue({
      error: 'Este negocio tiene servicios activos. Desactívalos antes de ponerlo en modo informativo.',
    })
    const user = userEvent.setup()
    render(<BusinessListingModeForm businessId={BUSINESS_ID} currentOverride={null} />)

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Este negocio tiene servicios activos. Desactívalos antes de ponerlo en modo informativo.',
      ),
    )
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    setBusinessListingModeOverrideMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<BusinessListingModeForm businessId={BUSINESS_ID} currentOverride={null} />)

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled()

    resolveAction({ success: true })
  })
})
