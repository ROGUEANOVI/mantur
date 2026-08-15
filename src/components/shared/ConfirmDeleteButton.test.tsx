import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConfirmDeleteButton from './ConfirmDeleteButton'

describe('ConfirmDeleteButton', () => {
  it('does not show the dialog until the trigger is clicked', () => {
    render(
      <ConfirmDeleteButton
        title="Eliminar lugar"
        description="Esta acción no se puede deshacer."
        trigger="Eliminar"
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the confirmation dialog when the trigger is clicked', async () => {
    const user = userEvent.setup()
    render(
      <ConfirmDeleteButton
        title="Eliminar lugar"
        description="Esta acción no se puede deshacer."
        trigger="Eliminar"
        onConfirm={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Eliminar' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Eliminar lugar')).toBeInTheDocument()
    expect(screen.getByText('Esta acción no se puede deshacer.')).toBeInTheDocument()
  })

  it('calls onConfirm and closes the dialog when the destructive action is confirmed', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <ConfirmDeleteButton
        title="Eliminar lugar"
        description="Esta acción no se puede deshacer."
        trigger="Eliminar"
        confirmLabel="Sí, eliminar"
        onConfirm={onConfirm}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    await user.click(screen.getByRole('button', { name: 'Sí, eliminar' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not call onConfirm when the dialog is cancelled', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <ConfirmDeleteButton
        title="Eliminar lugar"
        description="Esta acción no se puede deshacer."
        trigger="Eliminar"
        cancelLabel="Cancelar"
        onConfirm={onConfirm}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('disables the trigger when disabled is set', () => {
    render(
      <ConfirmDeleteButton
        title="Eliminar lugar"
        description="Esta acción no se puede deshacer."
        trigger="Eliminar"
        disabled
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeDisabled()
  })
})
