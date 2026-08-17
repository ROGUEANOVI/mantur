import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BusinessStatusToggle from './BusinessStatusToggle'

const toggleBusinessStatusMock = vi.fn()
const toastErrorMock = vi.fn()

vi.mock('@/app/(app)/mi-negocio/actions', () => ({
  toggleBusinessStatus: (...args: unknown[]) => toggleBusinessStatusMock(...args),
}))

vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
}))

const BIZ_ID = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BusinessStatusToggle', () => {
  it('shows "Visible en Explorar" and the active styling when the business is active', () => {
    render(<BusinessStatusToggle businessId={BIZ_ID} status="active" />)
    expect(screen.getByText('Visible en Explorar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ocultar negocio de Explorar' })).toHaveClass('bg-primary')
  })

  it('shows "Oculto de Explorar" and the inactive styling when the business is inactive', () => {
    render(<BusinessStatusToggle businessId={BIZ_ID} status="inactive" />)
    expect(screen.getByText('Oculto de Explorar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mostrar negocio en Explorar' })).toHaveClass('bg-muted-foreground/30')
  })

  it('submits businessId and the current status on click', async () => {
    toggleBusinessStatusMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<BusinessStatusToggle businessId={BIZ_ID} status="active" />)

    await user.click(screen.getByRole('button', { name: 'Ocultar negocio de Explorar' }))

    expect(toggleBusinessStatusMock).toHaveBeenCalledWith(BIZ_ID, 'active')
  })

  it('disables the switch while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    toggleBusinessStatusMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<BusinessStatusToggle businessId={BIZ_ID} status="active" />)

    const button = screen.getByRole('button', { name: 'Ocultar negocio de Explorar' })
    await user.click(button)

    expect(button).toBeDisabled()

    resolveAction(undefined)
  })

  it('shows an error toast when the action fails', async () => {
    toggleBusinessStatusMock.mockResolvedValue({ error: 'No se pudo desactivar el negocio. Intenta de nuevo.' })
    const user = userEvent.setup()
    render(<BusinessStatusToggle businessId={BIZ_ID} status="active" />)

    await user.click(screen.getByRole('button', { name: 'Ocultar negocio de Explorar' }))

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('No se pudo desactivar el negocio. Intenta de nuevo.'),
    )
  })
})
