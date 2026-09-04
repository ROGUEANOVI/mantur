import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import PayoutAccountForm from './PayoutAccountForm'

const savePayoutAccountMock = vi.fn()

vi.mock('@/app/(app)/mi-negocio/actions', () => ({
  savePayoutAccount: (...args: unknown[]) => savePayoutAccountMock(...args),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const BUSINESS_ID = '11111111-1111-1111-1111-111111111111'

const BANKS = [
  { id: 'bank-bancolombia', name: 'Bancolombia' },
  { id: 'bank-davivienda', name: 'Davivienda' },
]

const DEFAULT_VALUES = {
  bankName: 'Bancolombia',
  wompiBankId: 'bank-bancolombia',
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
    render(<PayoutAccountForm businessId={BUSINESS_ID} banks={BANKS} defaultValues={null} />)
    expect(screen.getByLabelText('Banco')).toHaveValue('')
  })

  it('pre-populates every field from defaultValues', () => {
    render(<PayoutAccountForm businessId={BUSINESS_ID} banks={BANKS} defaultValues={DEFAULT_VALUES} />)

    expect(screen.getByLabelText('Banco')).toHaveValue('bank-bancolombia')
    expect(screen.getByLabelText('Tipo de cuenta')).toHaveValue('ahorros')
    expect(screen.getByLabelText('Número de cuenta')).toHaveValue('00011122233')
    expect(screen.getByLabelText('Tipo de documento del titular')).toHaveValue('NIT')
    expect(screen.getByLabelText('Número de documento del titular')).toHaveValue('900123456')
    expect(screen.getByLabelText('Nombre del titular')).toHaveValue('Finca El Paraíso')
    expect(screen.getByLabelText('Correo del titular')).toHaveValue('finca@example.com')
  })

  it('keeps a previously saved bank selectable even if it is missing from the current catalog', () => {
    render(<PayoutAccountForm businessId={BUSINESS_ID} banks={[]} defaultValues={DEFAULT_VALUES} />)

    expect(screen.getByLabelText('Banco')).toHaveValue('bank-bancolombia')
    expect(screen.getByRole('option', { name: 'Bancolombia' })).toBeInTheDocument()
  })

  it('submits the form fields, bound to the business id, including the selected bank id', async () => {
    savePayoutAccountMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<PayoutAccountForm businessId={BUSINESS_ID} banks={BANKS} defaultValues={null} />)

    await user.selectOptions(screen.getByLabelText('Banco'), 'bank-davivienda')
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
    expect(fd.get('wompi_bank_id')).toBe('bank-davivienda')
    expect(fd.get('bank_name')).toBe('Davivienda')
    expect(fd.get('account_type')).toBe('corriente')
    expect(fd.get('account_number')).toBe('123456')
    expect(fd.get('holder_id_type')).toBe('CC')
    expect(fd.get('holder_id_number')).toBe('1002003000')
    expect(fd.get('holder_name')).toBe('Juan Pérez')
    expect(fd.get('holder_email')).toBe('juan@example.com')
  })

  it('shows a success toast after a successful save', async () => {
    savePayoutAccountMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<PayoutAccountForm businessId={BUSINESS_ID} banks={BANKS} defaultValues={DEFAULT_VALUES} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cuenta' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Cuenta de pagos guardada.'))
  })

  // Regression: React 19 resets a <form>'s uncontrolled fields after a
  // successful action. A <select> using defaultValue (rather than a
  // controlled value) gets reset to its first (disabled placeholder) option
  // by that native reset, since React never marks the chosen <option> as
  // `selected` in the DOM — even though the save itself succeeded and the
  // value is correctly persisted server-side. All three dropdowns must
  // survive it.
  it('keeps the selected dropdown values visible after a successful save', async () => {
    savePayoutAccountMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<PayoutAccountForm businessId={BUSINESS_ID} banks={BANKS} defaultValues={null} />)

    await user.selectOptions(screen.getByLabelText('Banco'), 'bank-davivienda')
    await user.selectOptions(screen.getByLabelText('Tipo de cuenta'), 'corriente')
    await user.selectOptions(screen.getByLabelText('Tipo de documento del titular'), 'CC')
    await user.click(screen.getByRole('button', { name: 'Guardar cuenta' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalled())

    expect(screen.getByLabelText('Banco')).toHaveValue('bank-davivienda')
    expect(screen.getByLabelText('Tipo de cuenta')).toHaveValue('corriente')
    expect(screen.getByLabelText('Tipo de documento del titular')).toHaveValue('CC')
  })

  it('shows the server-returned error message as a toast', async () => {
    savePayoutAccountMock.mockResolvedValue({ error: 'Escribe un correo electrónico válido.' })
    const user = userEvent.setup()
    render(<PayoutAccountForm businessId={BUSINESS_ID} banks={BANKS} defaultValues={DEFAULT_VALUES} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cuenta' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Escribe un correo electrónico válido.'))
  })
})
