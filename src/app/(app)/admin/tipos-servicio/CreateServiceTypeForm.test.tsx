import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CreateServiceTypeForm from './CreateServiceTypeForm'

const createServiceTypeMock = vi.fn()

vi.mock('./actions', () => ({
  createServiceType: (formData: FormData) => createServiceTypeMock(formData),
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

  it('shows the server-returned error message', async () => {
    createServiceTypeMock.mockResolvedValue({ error: 'Ya existe un tipo de servicio con ese slug.' })
    await fillAndSubmit('Pasadía', 'Por persona')

    expect(await screen.findByText('Ya existe un tipo de servicio con ese slug.')).toBeInTheDocument()
  })

  it('shows a success message and clears the input after a successful submission', async () => {
    createServiceTypeMock.mockResolvedValue({ success: true })
    await fillAndSubmit('Pasadía', 'Por persona')

    expect(await screen.findByText('Tipo de servicio creado correctamente.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Ej: Pasadía')).toHaveValue('')
  })

  it('renders neither message before submission', () => {
    render(<CreateServiceTypeForm />)
    expect(screen.queryByText('Tipo de servicio creado correctamente.')).not.toBeInTheDocument()
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    createServiceTypeMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    await fillAndSubmit('Pasadía', 'Por noche')

    expect(await screen.findByRole('button', { name: 'Agregando...' })).toBeDisabled()

    resolveAction({ success: true })
  })
})
