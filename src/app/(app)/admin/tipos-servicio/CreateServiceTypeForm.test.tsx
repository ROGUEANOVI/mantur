import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CreateServiceTypeForm from './CreateServiceTypeForm'

const createServiceTypeMock = vi.fn()
const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()

vi.mock('./actions', () => ({
  createServiceType: (formData: FormData) => createServiceTypeMock(formData),
}))

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

async function fillAndSubmit(name: string, pricingUnitLabel: string) {
  const user = userEvent.setup()
  render(<CreateServiceTypeForm />)

  await user.type(screen.getByPlaceholderText('Ej: Pasadía'), name)
  await user.selectOptions(screen.getByLabelText('Unidad de precio'), pricingUnitLabel)
  await user.click(screen.getByRole('button', { name: /agregar/i }))

  return user
}

describe('CreateServiceTypeForm', () => {
  it('submits the typed name and selected pricing unit to createServiceType', async () => {
    createServiceTypeMock.mockResolvedValue({ success: true })
    await fillAndSubmit('Excursión guiada', 'Por persona')

    expect(createServiceTypeMock).toHaveBeenCalledTimes(1)
    const fd = createServiceTypeMock.mock.calls[0][0] as FormData
    expect(fd.get('name')).toBe('Excursión guiada')
    expect(fd.get('pricing_unit')).toBe('per_person')
  })

  it('shows the server-returned error as a toast', async () => {
    createServiceTypeMock.mockResolvedValue({ error: 'Ya existe un tipo de servicio con ese slug.' })
    await fillAndSubmit('Pasadía', 'Por persona')

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Ya existe un tipo de servicio con ese slug.'),
    )
    expect(toastSuccessMock).not.toHaveBeenCalled()
  })

  it('shows a success toast and clears the input after a successful submission', async () => {
    createServiceTypeMock.mockResolvedValue({ success: true })
    await fillAndSubmit('Pasadía', 'Por persona')

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith('Tipo de servicio creado correctamente.'),
    )
    expect(screen.getByPlaceholderText('Ej: Pasadía')).toHaveValue('')
  })

  it('shows no toast before submission', () => {
    render(<CreateServiceTypeForm />)
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    createServiceTypeMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    await fillAndSubmit('Pasadía', 'Por noche')

    expect(await screen.findByRole('button', { name: 'Agregando...' })).toBeDisabled()

    resolveAction({ success: true })
  })
})
