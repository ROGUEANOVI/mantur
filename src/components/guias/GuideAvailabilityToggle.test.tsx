import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GuideAvailabilityToggle from './GuideAvailabilityToggle'

const toggleGuideAvailabilityMock = vi.fn()

vi.mock('@/app/(app)/mi-perfil-guia/actions', () => ({
  toggleGuideAvailability: (...args: unknown[]) => toggleGuideAvailabilityMock(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GuideAvailabilityToggle', () => {
  it('shows "Marcar como no disponible" and the active styling when currently available', () => {
    render(<GuideAvailabilityToggle isAvailable={true} />)
    const button = screen.getByRole('button', { name: 'Marcar como no disponible' })
    expect(button).toHaveClass('bg-primary')
  })

  it('shows "Marcar como disponible" and the inactive styling when currently unavailable', () => {
    render(<GuideAvailabilityToggle isAvailable={false} />)
    const button = screen.getByRole('button', { name: 'Marcar como disponible' })
    expect(button).toHaveClass('bg-muted-foreground/30')
  })

  it('submits the toggle action on click', async () => {
    toggleGuideAvailabilityMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<GuideAvailabilityToggle isAvailable={true} />)

    await user.click(screen.getByRole('button', { name: 'Marcar como no disponible' }))

    expect(toggleGuideAvailabilityMock).toHaveBeenCalledTimes(1)
  })

  it('disables the button while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    toggleGuideAvailabilityMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<GuideAvailabilityToggle isAvailable={true} />)

    const button = screen.getByRole('button', { name: 'Marcar como no disponible' })
    await user.click(button)

    expect(button).toBeDisabled()

    resolveAction(undefined)
  })
})
