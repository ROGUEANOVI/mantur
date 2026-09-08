import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import TransporterPayoutAccountForm from './TransporterPayoutAccountForm'

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

const saveTransporterPayoutAccountMock = vi.fn()

vi.mock('@/app/(app)/mi-perfil-transporte/actions', () => ({
  saveTransporterPayoutAccount: (formData: FormData) => saveTransporterPayoutAccountMock(formData),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const BANKS = [
  { id: 'bank-bancolombia', name: 'Bancolombia' },
  { id: 'bank-nequi', name: 'Nequi' },
]

const DEFAULT_VALUES = {
  bankName: 'Bancolombia',
  wompiBankId: 'bank-bancolombia',
  accountType: 'ahorros',
  accountNumber: '00011122233',
  holderIdType: 'CC',
  holderIdNumber: '1002003000',
  holderName: 'Pedro Transportista',
  holderEmail: 'pedro@example.com',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TransporterPayoutAccountForm', () => {
  it('renders empty fields when there is no existing account', () => {
    render(<TransporterPayoutAccountForm banks={BANKS} banksLoadFailed={false} defaultValues={null} />)
    expect(screen.getByLabelText('Banco')).toHaveValue('')
  })

  it('pre-populates every field from defaultValues', () => {
    render(<TransporterPayoutAccountForm banks={BANKS} banksLoadFailed={false} defaultValues={DEFAULT_VALUES} />)

    expect(screen.getByLabelText('Banco')).toHaveValue('bank-bancolombia')
    expect(screen.getByLabelText('Tipo de cuenta')).toHaveValue('ahorros')
    expect(screen.getByLabelText('Número de cuenta')).toHaveValue('00011122233')
    expect(screen.getByLabelText('Tipo de documento del titular')).toHaveValue('CC')
    expect(screen.getByLabelText('Número de documento del titular')).toHaveValue('1002003000')
    expect(screen.getByLabelText('Nombre del titular')).toHaveValue('Pedro Transportista')
    expect(screen.getByLabelText('Correo del titular')).toHaveValue('pedro@example.com')
  })

  it('keeps a previously saved bank selectable even if it is missing from the current catalog', () => {
    render(<TransporterPayoutAccountForm banks={[]} banksLoadFailed={false} defaultValues={DEFAULT_VALUES} />)

    expect(screen.getByLabelText('Banco')).toHaveValue('bank-bancolombia')
    expect(screen.getByRole('option', { name: 'Bancolombia' })).toBeInTheDocument()
  })

  it('submits the typed values including the selected bank id', async () => {
    saveTransporterPayoutAccountMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<TransporterPayoutAccountForm banks={BANKS} banksLoadFailed={false} defaultValues={null} />)

    await user.selectOptions(screen.getByLabelText('Banco'), 'bank-nequi')
    await user.selectOptions(screen.getByLabelText('Tipo de cuenta'), 'corriente')
    await user.type(screen.getByLabelText('Número de cuenta'), '999888')
    await user.selectOptions(screen.getByLabelText('Tipo de documento del titular'), 'NIT')
    await user.type(screen.getByLabelText('Número de documento del titular'), '900555444')
    await user.type(screen.getByLabelText('Nombre del titular'), 'Carlos Transportista')
    await user.type(screen.getByLabelText('Correo del titular'), 'carlos@example.com')
    await user.click(screen.getByRole('button', { name: 'Guardar cuenta' }))

    expect(saveTransporterPayoutAccountMock).toHaveBeenCalledTimes(1)
    const fd = saveTransporterPayoutAccountMock.mock.calls[0][0] as FormData
    expect(fd.get('wompi_bank_id')).toBe('bank-nequi')
    expect(fd.get('bank_name')).toBe('Nequi')
    expect(fd.get('account_type')).toBe('corriente')
    expect(fd.get('holder_id_type')).toBe('NIT')
  })

  it('shows a success toast after a successful save', async () => {
    saveTransporterPayoutAccountMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<TransporterPayoutAccountForm banks={BANKS} banksLoadFailed={false} defaultValues={DEFAULT_VALUES} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cuenta' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Cuenta de pagos guardada.'))
  })

  // Regression: React 19 resets a <form>'s uncontrolled fields after a
  // successful action — see GuidePayoutAccountForm.test.tsx's identical
  // regression test for the full explanation.
  it('keeps the selected dropdown values visible after a successful save', async () => {
    saveTransporterPayoutAccountMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<TransporterPayoutAccountForm banks={BANKS} banksLoadFailed={false} defaultValues={null} />)

    await user.selectOptions(screen.getByLabelText('Banco'), 'bank-nequi')
    await user.selectOptions(screen.getByLabelText('Tipo de cuenta'), 'corriente')
    await user.type(screen.getByLabelText('Número de cuenta'), '999888')
    await user.selectOptions(screen.getByLabelText('Tipo de documento del titular'), 'CC')
    await user.type(screen.getByLabelText('Número de documento del titular'), '1002003000')
    await user.type(screen.getByLabelText('Nombre del titular'), 'Carlos Transportista')
    await user.type(screen.getByLabelText('Correo del titular'), 'carlos@example.com')
    await user.click(screen.getByRole('button', { name: 'Guardar cuenta' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalled())

    expect(screen.getByLabelText('Banco')).toHaveValue('bank-nequi')
    expect(screen.getByLabelText('Tipo de cuenta')).toHaveValue('corriente')
    expect(screen.getByLabelText('Tipo de documento del titular')).toHaveValue('CC')
  })

  it('shows the server-returned error message as a toast', async () => {
    saveTransporterPayoutAccountMock.mockResolvedValue({ error: 'Selecciona un tipo de cuenta válido.' })
    const user = userEvent.setup()
    render(<TransporterPayoutAccountForm banks={BANKS} banksLoadFailed={false} defaultValues={DEFAULT_VALUES} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cuenta' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Selecciona un tipo de cuenta válido.'))
  })

  it('shows a descriptive placeholder option for every select, never a bare dash', () => {
    render(<TransporterPayoutAccountForm banks={BANKS} banksLoadFailed={false} defaultValues={null} />)

    expect(screen.getByRole('option', { name: '— Selecciona un banco —' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '— Selecciona un tipo de cuenta —' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '— Selecciona un tipo de documento —' })).toBeInTheDocument()
  })

  it('shows an inline error with a retry action when the bank catalog failed to load, and refreshes the page on click', async () => {
    const user = userEvent.setup()
    render(<TransporterPayoutAccountForm banks={[]} banksLoadFailed={true} defaultValues={null} />)

    expect(screen.getByText('No pudimos cargar la lista de bancos de Wompi. Intenta de nuevo.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })
})
