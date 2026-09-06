import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import CheckDianStatusButton from './CheckDianStatusButton'

const checkInvoiceDianStatusMock = vi.fn()

vi.mock('@/app/(app)/admin/facturas/actions', () => ({
  checkInvoiceDianStatus: (formData: FormData) => checkInvoiceDianStatusMock(formData),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const TRANSACTION_ID = '33333333-3333-3333-3333-333333333333'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CheckDianStatusButton', () => {
  it('submits the transactionId as a hidden field', async () => {
    checkInvoiceDianStatusMock.mockResolvedValue({ success: true, message: 'Estado actualizado.' })
    const user = userEvent.setup()
    render(<CheckDianStatusButton transactionId={TRANSACTION_ID} />)

    await user.click(screen.getByRole('button', { name: 'Verificar estado DIAN' }))

    expect(checkInvoiceDianStatusMock).toHaveBeenCalledTimes(1)
    const fd = checkInvoiceDianStatusMock.mock.calls[0][0] as FormData
    expect(fd.get('transactionId')).toBe(TRANSACTION_ID)
  })

  it('shows a success toast with the server message', async () => {
    checkInvoiceDianStatusMock.mockResolvedValue({ success: true, message: 'Todavía sin confirmar en la DIAN — sin cambios.' })
    const user = userEvent.setup()
    render(<CheckDianStatusButton transactionId={TRANSACTION_ID} />)

    await user.click(screen.getByRole('button', { name: 'Verificar estado DIAN' }))

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Todavía sin confirmar en la DIAN — sin cambios.'),
    )
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('shows the server-returned error as a toast', async () => {
    checkInvoiceDianStatusMock.mockResolvedValue({ error: 'Transacción o factura no encontrada.' })
    const user = userEvent.setup()
    render(<CheckDianStatusButton transactionId={TRANSACTION_ID} />)

    await user.click(screen.getByRole('button', { name: 'Verificar estado DIAN' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Transacción o factura no encontrada.'))
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('disables the button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    checkInvoiceDianStatusMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<CheckDianStatusButton transactionId={TRANSACTION_ID} />)

    await user.click(screen.getByRole('button', { name: 'Verificar estado DIAN' }))

    expect(await screen.findByRole('button', { name: 'Verificando...' })).toBeDisabled()

    resolveAction({ success: true, message: 'Estado actualizado.' })
  })
})
