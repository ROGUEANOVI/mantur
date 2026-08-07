import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToggleExperienceButton } from './ToggleExperienceButton'

const toggleExperienceStatusMock = vi.fn()

vi.mock('@/app/(app)/mi-negocio/actions', () => ({
  toggleExperienceStatus: (...args: unknown[]) => toggleExperienceStatusMock(...args),
}))

const EXP_ID = '22222222-2222-2222-2222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ToggleExperienceButton', () => {
  it('shows "Desactivar" when the experience is currently active', () => {
    render(<ToggleExperienceButton experienceId={EXP_ID} currentStatus="active" />)
    expect(screen.getByRole('button', { name: 'Desactivar experiencia' })).toHaveTextContent('Desactivar')
  })

  it('shows "Activar" when the experience is currently inactive', () => {
    render(<ToggleExperienceButton experienceId={EXP_ID} currentStatus="inactive" />)
    expect(screen.getByRole('button', { name: 'Activar experiencia' })).toHaveTextContent('Activar')
  })

  it('calls toggleExperienceStatus with the experienceId and the current status on click', async () => {
    toggleExperienceStatusMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<ToggleExperienceButton experienceId={EXP_ID} currentStatus="active" />)

    await user.click(screen.getByRole('button', { name: 'Desactivar experiencia' }))

    expect(toggleExperienceStatusMock).toHaveBeenCalledWith(EXP_ID, 'active')
  })

  it('disables the button and shows the pending label while the transition is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    toggleExperienceStatusMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<ToggleExperienceButton experienceId={EXP_ID} currentStatus="active" />)

    await user.click(screen.getByRole('button', { name: 'Desactivar experiencia' }))

    expect(await screen.findByRole('button', { name: 'Desactivar experiencia' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Desactivar experiencia' })).toHaveTextContent('Actualizando...')

    resolveAction(undefined)
  })
})
