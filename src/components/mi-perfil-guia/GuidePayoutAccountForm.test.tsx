import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GuidePayoutAccountForm from './GuidePayoutAccountForm'

const saveGuidePayoutAccountMock = vi.fn()

vi.mock('@/app/(app)/mi-perfil-guia/actions', () => ({
  saveGuidePayoutAccount: (formData: FormData) => saveGuidePayoutAccountMock(formData),
}))

const DEFAULT_VALUES = {
  bankName: 'Bancolombia',
  accountType: 'ahorros',
  accountNumber: '00011122233',
  holderIdType: 'CC',
  holderIdNumber: '1002003000',
  holderName: 'María Guía',
  holderEmail: 'maria@example.com',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GuidePayoutAccountForm', () => {
  it('renders empty fields when there is no existing account', () => {
    render(<GuidePayoutAccountForm defaultValues={null} />)
    expect(screen.getByLabelText('Banco')).toHaveValue('')
  })

  it('pre-populates every field from defaultValues', () => {
    render(<GuidePayoutAccountForm defaultValues={DEFAULT_VALUES} />)

    expect(screen.getByLabelText('Banco')).toHaveValue('Bancolombia')
    expect(screen.getByLabelText('Tipo de cuenta')).toHaveValue('ahorros')
    expect(screen.getByLabelText('Número de cuenta')).toHaveValue('00011122233')
    expect(screen.getByLabelText('Tipo de documento del titular')).toHaveValue('CC')
    expect(screen.getByLabelText('Número de documento del titular')).toHaveValue('1002003000')
    expect(screen.getByLabelText('Nombre del titular')).toHaveValue('María Guía')
    expect(screen.getByLabelText('Correo del titular')).toHaveValue('maria@example.com')
  })

  it('submits the typed values and never includes a wompi_bank_id field', async () => {
    saveGuidePayoutAccountMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<GuidePayoutAccountForm defaultValues={null} />)

    await user.type(screen.getByLabelText('Banco'), 'Nequi')
    await user.selectOptions(screen.getByLabelText('Tipo de cuenta'), 'corriente')
    await user.type(screen.getByLabelText('Número de cuenta'), '999888')
    await user.selectOptions(screen.getByLabelText('Tipo de documento del titular'), 'NIT')
    await user.type(screen.getByLabelText('Número de documento del titular'), '900555444')
    await user.type(screen.getByLabelText('Nombre del titular'), 'Carlos Guía')
    await user.type(screen.getByLabelText('Correo del titular'), 'carlos@example.com')
    await user.click(screen.getByRole('button', { name: 'Guardar cuenta' }))

    expect(saveGuidePayoutAccountMock).toHaveBeenCalledTimes(1)
    const fd = saveGuidePayoutAccountMock.mock.calls[0][0] as FormData
    expect(fd.get('bank_name')).toBe('Nequi')
    expect(fd.get('account_type')).toBe('corriente')
    expect(fd.get('holder_id_type')).toBe('NIT')
    expect(fd.get('wompi_bank_id')).toBeNull()
  })

  it('shows a success message after a successful save', async () => {
    saveGuidePayoutAccountMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<GuidePayoutAccountForm defaultValues={DEFAULT_VALUES} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cuenta' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Cuenta de pagos guardada.')
  })

  it('shows the server-returned error message', async () => {
    saveGuidePayoutAccountMock.mockResolvedValue({ error: 'Selecciona un tipo de cuenta válido.' })
    const user = userEvent.setup()
    render(<GuidePayoutAccountForm defaultValues={DEFAULT_VALUES} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cuenta' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Selecciona un tipo de cuenta válido.')
  })
})
