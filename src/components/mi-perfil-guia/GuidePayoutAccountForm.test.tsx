import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GuidePayoutAccountForm from './GuidePayoutAccountForm'

const saveGuidePayoutAccountMock = vi.fn()

vi.mock('@/app/(app)/mi-perfil-guia/actions', () => ({
  saveGuidePayoutAccount: (formData: FormData) => saveGuidePayoutAccountMock(formData),
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
  holderName: 'María Guía',
  holderEmail: 'maria@example.com',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GuidePayoutAccountForm', () => {
  it('renders empty fields when there is no existing account', () => {
    render(<GuidePayoutAccountForm banks={BANKS} defaultValues={null} />)
    expect(screen.getByLabelText('Banco')).toHaveValue('')
  })

  it('pre-populates every field from defaultValues', () => {
    render(<GuidePayoutAccountForm banks={BANKS} defaultValues={DEFAULT_VALUES} />)

    expect(screen.getByLabelText('Banco')).toHaveValue('bank-bancolombia')
    expect(screen.getByLabelText('Tipo de cuenta')).toHaveValue('ahorros')
    expect(screen.getByLabelText('Número de cuenta')).toHaveValue('00011122233')
    expect(screen.getByLabelText('Tipo de documento del titular')).toHaveValue('CC')
    expect(screen.getByLabelText('Número de documento del titular')).toHaveValue('1002003000')
    expect(screen.getByLabelText('Nombre del titular')).toHaveValue('María Guía')
    expect(screen.getByLabelText('Correo del titular')).toHaveValue('maria@example.com')
  })

  it('keeps a previously saved bank selectable even if it is missing from the current catalog', () => {
    render(<GuidePayoutAccountForm banks={[]} defaultValues={DEFAULT_VALUES} />)

    expect(screen.getByLabelText('Banco')).toHaveValue('bank-bancolombia')
    expect(screen.getByRole('option', { name: 'Bancolombia' })).toBeInTheDocument()
  })

  it('submits the typed values including the selected bank id', async () => {
    saveGuidePayoutAccountMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<GuidePayoutAccountForm banks={BANKS} defaultValues={null} />)

    await user.selectOptions(screen.getByLabelText('Banco'), 'bank-nequi')
    await user.selectOptions(screen.getByLabelText('Tipo de cuenta'), 'corriente')
    await user.type(screen.getByLabelText('Número de cuenta'), '999888')
    await user.selectOptions(screen.getByLabelText('Tipo de documento del titular'), 'NIT')
    await user.type(screen.getByLabelText('Número de documento del titular'), '900555444')
    await user.type(screen.getByLabelText('Nombre del titular'), 'Carlos Guía')
    await user.type(screen.getByLabelText('Correo del titular'), 'carlos@example.com')
    await user.click(screen.getByRole('button', { name: 'Guardar cuenta' }))

    expect(saveGuidePayoutAccountMock).toHaveBeenCalledTimes(1)
    const fd = saveGuidePayoutAccountMock.mock.calls[0][0] as FormData
    expect(fd.get('wompi_bank_id')).toBe('bank-nequi')
    expect(fd.get('bank_name')).toBe('Nequi')
    expect(fd.get('account_type')).toBe('corriente')
    expect(fd.get('holder_id_type')).toBe('NIT')
  })

  it('shows a success message after a successful save', async () => {
    saveGuidePayoutAccountMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<GuidePayoutAccountForm banks={BANKS} defaultValues={DEFAULT_VALUES} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cuenta' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Cuenta de pagos guardada.')
  })

  // Regression: React 19 resets a <form>'s uncontrolled fields after a
  // successful action. A <select> using defaultValue (rather than a
  // controlled value) gets reset to its first (disabled placeholder) option
  // by that native reset, since React never marks the chosen <option> as
  // `selected` in the DOM — even though the save itself succeeded and the
  // value is correctly persisted server-side. All three dropdowns must
  // survive it.
  it('keeps the selected dropdown values visible after a successful save', async () => {
    saveGuidePayoutAccountMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<GuidePayoutAccountForm banks={BANKS} defaultValues={null} />)

    await user.selectOptions(screen.getByLabelText('Banco'), 'bank-nequi')
    await user.selectOptions(screen.getByLabelText('Tipo de cuenta'), 'corriente')
    await user.type(screen.getByLabelText('Número de cuenta'), '999888')
    await user.selectOptions(screen.getByLabelText('Tipo de documento del titular'), 'CC')
    await user.type(screen.getByLabelText('Número de documento del titular'), '1002003000')
    await user.type(screen.getByLabelText('Nombre del titular'), 'Carlos Guía')
    await user.type(screen.getByLabelText('Correo del titular'), 'carlos@example.com')
    await user.click(screen.getByRole('button', { name: 'Guardar cuenta' }))

    await screen.findByRole('status')

    expect(screen.getByLabelText('Banco')).toHaveValue('bank-nequi')
    expect(screen.getByLabelText('Tipo de cuenta')).toHaveValue('corriente')
    expect(screen.getByLabelText('Tipo de documento del titular')).toHaveValue('CC')
  })

  it('shows the server-returned error message', async () => {
    saveGuidePayoutAccountMock.mockResolvedValue({ error: 'Selecciona un tipo de cuenta válido.' })
    const user = userEvent.setup()
    render(<GuidePayoutAccountForm banks={BANKS} defaultValues={DEFAULT_VALUES} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cuenta' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Selecciona un tipo de cuenta válido.')
  })
})
