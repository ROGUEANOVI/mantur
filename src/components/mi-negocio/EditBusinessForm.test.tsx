import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EditBusinessForm from './EditBusinessForm'

const updateBusinessMock = vi.fn()

vi.mock('@/app/(app)/mi-negocio/actions', () => ({
  updateBusiness: (...args: unknown[]) => updateBusinessMock(...args),
}))

vi.mock('@/components/shared/LocationPicker', () => ({
  default: ({ defaultLat, defaultLng }: { defaultLat: number | null; defaultLng: number | null }) => (
    <>
      <input type="hidden" name="lat" value={defaultLat ?? ''} />
      <input type="hidden" name="lng" value={defaultLng ?? ''} />
    </>
  ),
}))

const CATEGORIES = [
  { id: 'cat-1', name: 'Restaurante' },
  { id: 'cat-2', name: 'Finca' },
]

const BIZ_ID = '11111111-1111-1111-1111-111111111111'

const DEFAULT_VALUES = {
  name: 'Finca La Esperanza',
  description: 'Un lugar tranquilo',
  address: 'Calle 5 #10-20',
  phone: '3001234567',
  lat: 11.7808,
  lng: -72.9944,
  rntNumber: '12345',
  rntStatus: 'pending_review',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('EditBusinessForm', () => {
  it('pre-populates every field from defaultValues', () => {
    const { container } = render(
      <EditBusinessForm
        businessId={BIZ_ID}
        defaultValues={DEFAULT_VALUES}
        categories={CATEGORIES}
        selectedCategoryIds={['cat-1']}
      />,
    )

    expect(screen.getByLabelText('Nombre')).toHaveValue('Finca La Esperanza')
    expect(screen.getByLabelText('Descripción')).toHaveValue('Un lugar tranquilo')
    expect(screen.getByLabelText('Dirección')).toHaveValue('Calle 5 #10-20')
    expect(screen.getByLabelText('Teléfono de contacto')).toHaveValue('3001234567')
    expect(container.querySelector('input[name="lat"]')).toHaveValue('11.7808')
    expect(container.querySelector('input[name="lng"]')).toHaveValue('-72.9944')
  })

  it('pre-checks only the categories in selectedCategoryIds', () => {
    render(
      <EditBusinessForm
        businessId={BIZ_ID}
        defaultValues={DEFAULT_VALUES}
        categories={CATEGORIES}
        selectedCategoryIds={['cat-2']}
      />,
    )

    expect(screen.getByRole('checkbox', { name: 'Restaurante' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Finca' })).toBeChecked()
  })

  it('falls back to empty strings for null description/address/phone', () => {
    render(
      <EditBusinessForm
        businessId={BIZ_ID}
        defaultValues={{ name: 'Finca X', description: null, address: null, phone: null, lat: null, lng: null, rntNumber: null, rntStatus: 'pending_review' }}
        categories={CATEGORIES}
        selectedCategoryIds={[]}
      />,
    )

    expect(screen.getByLabelText('Descripción')).toHaveValue('')
    expect(screen.getByLabelText('Dirección')).toHaveValue('')
    expect(screen.getByLabelText('Teléfono de contacto')).toHaveValue('')
  })

  it('submits changes scoped to the bound businessId', async () => {
    updateBusinessMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <EditBusinessForm
        businessId={BIZ_ID}
        defaultValues={DEFAULT_VALUES}
        categories={CATEGORIES}
        selectedCategoryIds={['cat-1']}
      />,
    )

    await user.clear(screen.getByLabelText('Nombre'))
    await user.type(screen.getByLabelText('Nombre'), 'Nuevo nombre')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(updateBusinessMock).toHaveBeenCalledTimes(1)
    const [calledBizId, fd] = updateBusinessMock.mock.calls[0] as [string, FormData]
    expect(calledBizId).toBe(BIZ_ID)
    expect(fd.get('name')).toBe('Nuevo nombre')
    expect(fd.getAll('category_ids')).toEqual(['cat-1'])
  })

  it('shows the current RNT status and number', () => {
    render(
      <EditBusinessForm
        businessId={BIZ_ID}
        defaultValues={DEFAULT_VALUES}
        categories={CATEGORIES}
        selectedCategoryIds={['cat-1']}
      />,
    )

    expect(screen.getByText('En revisión')).toBeInTheDocument()
    expect(screen.getByText(/RNT 12345/)).toBeInTheDocument()
  })

  it('does not require a new RNT document to save (re-upload is optional)', async () => {
    updateBusinessMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <EditBusinessForm
        businessId={BIZ_ID}
        defaultValues={DEFAULT_VALUES}
        categories={CATEGORIES}
        selectedCategoryIds={['cat-1']}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(updateBusinessMock).toHaveBeenCalledTimes(1)
  })

  it('submits a re-uploaded RNT document and number when provided', async () => {
    updateBusinessMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <EditBusinessForm
        businessId={BIZ_ID}
        defaultValues={DEFAULT_VALUES}
        categories={CATEGORIES}
        selectedCategoryIds={['cat-1']}
      />,
    )

    await user.clear(screen.getByLabelText(/número de registro nacional de turismo/i))
    await user.type(screen.getByLabelText(/número de registro nacional de turismo/i), '99999')
    await user.upload(
      screen.getByLabelText(/certificado rnt/i),
      new File(['x'], 'rnt-nuevo.pdf', { type: 'application/pdf' }),
    )
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    const [, fd] = updateBusinessMock.mock.calls[0] as [string, FormData]
    expect(fd.get('rnt_number')).toBe('99999')
    expect(fd.get('rnt_document')).toBeTruthy()
  })

  it('shows the server-returned error message', async () => {
    updateBusinessMock.mockResolvedValue({ error: 'No se pudo actualizar el negocio. Intenta de nuevo.' })
    const user = userEvent.setup()
    render(
      <EditBusinessForm
        businessId={BIZ_ID}
        defaultValues={DEFAULT_VALUES}
        categories={CATEGORIES}
        selectedCategoryIds={['cat-1']}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo actualizar el negocio. Intenta de nuevo.')
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    updateBusinessMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(
      <EditBusinessForm
        businessId={BIZ_ID}
        defaultValues={DEFAULT_VALUES}
        categories={CATEGORIES}
        selectedCategoryIds={['cat-1']}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled()

    resolveAction(undefined)
  })

  it('shows an inline error on blur for an invalid phone, without submitting', async () => {
    const user = userEvent.setup()
    render(
      <EditBusinessForm
        businessId={BIZ_ID}
        defaultValues={DEFAULT_VALUES}
        categories={CATEGORIES}
        selectedCategoryIds={['cat-1']}
      />,
    )

    const phoneInput = screen.getByLabelText('Teléfono de contacto')
    await user.clear(phoneInput)
    await user.type(phoneInput, 'abcdefgh')
    await user.tab()

    expect(
      await screen.findByText('Escribe un número de celular colombiano válido (10 dígitos, ej: 300 123 4567).'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(updateBusinessMock).not.toHaveBeenCalled()
  })
})
