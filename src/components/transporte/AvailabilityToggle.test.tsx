import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AvailabilityToggle from './AvailabilityToggle'

const toggleAvailabilityMock = vi.fn()
const toastErrorMock = vi.fn()

vi.mock('@/app/(app)/mi-perfil-transporte/actions', () => ({
  toggleAvailability: (...args: unknown[]) => toggleAvailabilityMock(...args),
}))

vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AvailabilityToggle', () => {
  it('shows "Marcar como no disponible" and the active styling when currently available', () => {
    render(<AvailabilityToggle isAvailable={true} />)
    const button = screen.getByRole('button', { name: 'Marcar como no disponible' })
    expect(button).toHaveClass('bg-primary')
  })

  it('shows "Marcar como disponible" and the inactive styling when currently unavailable', () => {
    render(<AvailabilityToggle isAvailable={false} />)
    const button = screen.getByRole('button', { name: 'Marcar como disponible' })
    expect(button).toHaveClass('bg-muted-foreground/30')
  })

  it('submits the toggle action on click', async () => {
    toggleAvailabilityMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<AvailabilityToggle isAvailable={true} />)

    await user.click(screen.getByRole('button', { name: 'Marcar como no disponible' }))

    expect(toggleAvailabilityMock).toHaveBeenCalledTimes(1)
  })

  it('disables the button while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    toggleAvailabilityMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<AvailabilityToggle isAvailable={true} />)

    const button = screen.getByRole('button', { name: 'Marcar como no disponible' })
    await user.click(button)

    expect(button).toBeDisabled()

    resolveAction(undefined)
  })

  it('shows an error toast when the action fails', async () => {
    toggleAvailabilityMock.mockResolvedValue({ error: 'No se pudo actualizar la disponibilidad.' })
    const user = userEvent.setup()
    render(<AvailabilityToggle isAvailable={true} />)

    await user.click(screen.getByRole('button', { name: 'Marcar como no disponible' }))

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('No se pudo actualizar la disponibilidad.'),
    )
  })
})
