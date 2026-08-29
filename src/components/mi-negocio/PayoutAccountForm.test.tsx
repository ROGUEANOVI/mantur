import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PayoutAccountForm from './PayoutAccountForm'

const savePayoutAccountMock = vi.fn()

vi.mock('@/app/(app)/mi-negocio/actions', () => ({
  savePayoutAccount: (...args: unknown[]) => savePayoutAccountMock(...args),
}))

const BUSINESS_ID = '11111111-1111-1111-1111-111111111111'

const DEFAULT_VALUES = {
  bankName: 'Bancolombia',
  accountType: 'ahorros',
  accountNumber: '00011122233',
  holderIdType: 'NIT',
  holderIdNumber: '900123456',
  holderName: 'Finca El Paraíso',
  holderEmail: 'finca@example.com',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PayoutAccountForm', () => {
  it('renders empty fields when there is no existing account', () => {
    render(<PayoutAccountForm businessId={BUSINESS_ID} defaultValues={null} />)
    expect(screen.getByLabelText('Banco')).toHaveValue('')
  })

  it('pre-populates every field from defaultValues', () => {
    render(<PayoutAccountForm businessId={BUSINESS_ID} defaultValues={DEFAULT_VALUES} />)

    expect(screen.getByLabelText('Banco')).toHaveValue('Bancolombia')
    expect(screen.getByLabelText('Tipo de cuenta')).toHaveValue('ahorros')
    expect(screen.getByLabelText('Número de cuenta')).toHaveValue('00011122233')
    expect(screen.getByLabelText('Tipo de documento del titular')).toHaveValue('NIT')
    expect(screen.getByLabelText('Número de documento del titular')).toHaveValue('900123456')
    expect(screen.getByLabelText('Nombre del titular')).toHaveValue('Finca El Paraíso')
    expect(screen.getByLabelText('Correo del titular')).toHaveValue('finca@example.com')
  })

  it('submits the form fields, bound to the business id, and never includes a wompi_bank_id field', async () => {
    savePayoutAccountMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<PayoutAccountForm businessId={BUSINESS_ID} defaultValues={null} />)

    await user.type(screen.getByLabelText('Banco'), 'Davivienda')
    await user.selectOptions(screen.getByLabelText('Tipo de cuenta'), 'corriente')
    await user.type(screen.getByLabelText('Número de cuenta'), '123456')
    await user.selectOptions(screen.getByLabelText('Tipo de documento del titular'), 'CC')
    await user.type(screen.getByLabelText('Número de documento del titular'), '1002003000')
    await user.type(screen.getByLabelText('Nombre del titular'), 'Juan Pérez')
    await user.type(screen.getByLabelText('Correo del titular'), 'juan@example.com')
    await user.click(screen.getByRole('button', { name: 'Guardar cuenta' }))

    expect(savePayoutAccountMock).toHaveBeenCalledTimes(1)
    const [boundBusinessId, fd] = savePayoutAccountMock.mock.calls[0] as [string, FormData]
    expect(boundBusinessId).toBe(BUSINESS_ID)
    expect(fd.get('bank_name')).toBe('Davivienda')
    expect(fd.get('account_type')).toBe('corriente')
    expect(fd.get('account_number')).toBe('123456')
    expect(fd.get('holder_id_type')).toBe('CC')
    expect(fd.get('holder_id_number')).toBe('1002003000')
    expect(fd.get('holder_name')).toBe('Juan Pérez')
    expect(fd.get('holder_email')).toBe('juan@example.com')
    expect(fd.get('wompi_bank_id')).toBeNull()
  })

  it('shows a success message after a successful save', async () => {
    savePayoutAccountMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<PayoutAccountForm businessId={BUSINESS_ID} defaultValues={DEFAULT_VALUES} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cuenta' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Cuenta de pagos guardada.')
  })

  it('shows the server-returned error message', async () => {
    savePayoutAccountMock.mockResolvedValue({ error: 'Escribe un correo electrónico válido.' })
    const user = userEvent.setup()
    render(<PayoutAccountForm businessId={BUSINESS_ID} defaultValues={DEFAULT_VALUES} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cuenta' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe un correo electrónico válido.')
  })
})
