import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import CreateBusinessForm from './CreateBusinessForm'

const createBusinessMock = vi.fn()

vi.mock('@/app/(app)/mi-negocio/actions', () => ({
  createBusiness: (formData: FormData) => createBusinessMock(formData),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('@/components/shared/LocationPicker', () => ({
  default: ({ defaultLat, defaultLng }: { defaultLat: number | null; defaultLng: number | null }) => (
    <>
      <input type="hidden" name="lat" value={defaultLat ?? ''} />
      <input type="hidden" name="lng" value={defaultLng ?? ''} />
    </>
  ),
}))

// Both fixture categories default_listing_mode 'bookable' — these tests
// exercise the ordinary (RNT-required) path. See the "informational
// category" describe block below for the notice/RNT-skip behavior, which
// needs an 'informational' category to trigger.
const CATEGORIES = [
  { id: 'cat-1', name: 'Restaurante', default_listing_mode: 'bookable' as const },
  { id: 'cat-2', name: 'Finca', default_listing_mode: 'bookable' as const },
]

const MIXED_CATEGORIES = [
  { id: 'cat-1', name: 'Restaurante', default_listing_mode: 'informational' as const },
  { id: 'cat-2', name: 'Finca', default_listing_mode: 'bookable' as const },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CreateBusinessForm', () => {
  it('renders the name field and one checkbox per category', () => {
    render(<CreateBusinessForm categories={CATEGORIES} />)
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Restaurante' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Finca' })).toBeInTheDocument()
  })

  it('submits the typed name and only the checked category ids', async () => {
    createBusinessMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<CreateBusinessForm categories={CATEGORIES} />)

    await user.type(screen.getByLabelText('Nombre'), 'Finca La Esperanza')
    await user.click(screen.getByRole('checkbox', { name: 'Restaurante' }))
    await user.click(screen.getByRole('button', { name: 'Crear negocio' }))

    expect(createBusinessMock).toHaveBeenCalledTimes(1)
    const fd = createBusinessMock.mock.calls[0][0] as FormData
    expect(fd.get('name')).toBe('Finca La Esperanza')
    expect(fd.getAll('category_ids')).toEqual(['cat-1'])
  })

  it('renders the RNT number and document fields', () => {
    render(<CreateBusinessForm categories={CATEGORIES} />)
    expect(screen.getByLabelText(/número de registro nacional de turismo/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/certificado rnt/i)).toBeInTheDocument()
  })

  it('submits the typed RNT number and uploaded document', async () => {
    createBusinessMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<CreateBusinessForm categories={CATEGORIES} />)

    await user.type(screen.getByLabelText('Nombre'), 'Finca La Esperanza')
    await user.click(screen.getByRole('checkbox', { name: 'Restaurante' }))
    await user.type(screen.getByLabelText(/número de registro nacional de turismo/i), '12345')
    await user.upload(
      screen.getByLabelText(/certificado rnt/i),
      new File(['x'], 'rnt.pdf', { type: 'application/pdf' }),
    )
    await user.click(screen.getByRole('button', { name: 'Crear negocio' }))

    const fd = createBusinessMock.mock.calls[0][0] as FormData
    expect(fd.get('rnt_number')).toBe('12345')
    expect(fd.get('rnt_document')).toBeTruthy()
  })

  it('shows the server-returned error message as a toast', async () => {
    createBusinessMock.mockResolvedValue({ error: 'Selecciona al menos una categoría.' })
    const user = userEvent.setup()
    render(<CreateBusinessForm categories={CATEGORIES} />)

    await user.type(screen.getByLabelText('Nombre'), 'Finca X')
    await user.click(screen.getByRole('button', { name: 'Crear negocio' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Selecciona al menos una categoría.'))
  })

  it('does not show an error toast before submission', () => {
    render(<CreateBusinessForm categories={CATEGORIES} />)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    createBusinessMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<CreateBusinessForm categories={CATEGORIES} />)

    await user.type(screen.getByLabelText('Nombre'), 'Finca X')
    await user.click(screen.getByRole('button', { name: 'Crear negocio' }))

    expect(await screen.findByRole('button', { name: 'Creando negocio...' })).toBeDisabled()

    resolveAction(undefined)
  })

  it('shows an inline error on blur for an invalid phone, without submitting', async () => {
    const user = userEvent.setup()
    render(<CreateBusinessForm categories={CATEGORIES} />)

    await user.type(screen.getByLabelText('Nombre'), 'Finca X')
    await user.type(screen.getByLabelText('WhatsApp del negocio'), 'abcdefgh')
    await user.tab()

    expect(
      await screen.findByText('Escribe un número de celular colombiano válido (10 dígitos, ej: 300 123 4567).'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Restaurante' }))
    await user.click(screen.getByRole('button', { name: 'Crear negocio' }))
    expect(createBusinessMock).not.toHaveBeenCalled()
  })
})

describe('CreateBusinessForm — informational category', () => {
  it('shows no notice and requires RNT before any category is selected', () => {
    render(<CreateBusinessForm categories={MIXED_CATEGORIES} />)
    expect(screen.queryByText(/tendrá un perfil informativo/)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/número de registro nacional de turismo/i)).toBeRequired()
  })

  it('shows the informational notice and hides RNT fields when only an informational category is checked', async () => {
    const user = userEvent.setup()
    render(<CreateBusinessForm categories={MIXED_CATEGORIES} />)

    await user.click(screen.getByRole('checkbox', { name: 'Restaurante' }))

    expect(screen.getByText(/tendrá un perfil informativo/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/número de registro nacional de turismo/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/certificado rnt/i)).not.toBeInTheDocument()
  })

  it('keeps requiring RNT and shows no notice when a bookable category is also checked', async () => {
    const user = userEvent.setup()
    render(<CreateBusinessForm categories={MIXED_CATEGORIES} />)

    await user.click(screen.getByRole('checkbox', { name: 'Restaurante' }))
    await user.click(screen.getByRole('checkbox', { name: 'Finca' }))

    expect(screen.queryByText(/tendrá un perfil informativo/)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/número de registro nacional de turismo/i)).toBeInTheDocument()
  })

  it('brings the RNT fields back after unchecking the only informational category', async () => {
    const user = userEvent.setup()
    render(<CreateBusinessForm categories={MIXED_CATEGORIES} />)

    const restaurante = screen.getByRole('checkbox', { name: 'Restaurante' })
    await user.click(restaurante)
    expect(screen.queryByLabelText(/número de registro nacional de turismo/i)).not.toBeInTheDocument()

    await user.click(restaurante)
    expect(screen.getByLabelText(/número de registro nacional de turismo/i)).toBeInTheDocument()
  })

  it('submits with no rnt_number/rnt_document when only informational categories are selected', async () => {
    createBusinessMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<CreateBusinessForm categories={MIXED_CATEGORIES} />)

    await user.type(screen.getByLabelText('Nombre'), 'La Sazón')
    await user.click(screen.getByRole('checkbox', { name: 'Restaurante' }))
    await user.click(screen.getByRole('button', { name: 'Crear negocio' }))

    expect(createBusinessMock).toHaveBeenCalledTimes(1)
    const fd = createBusinessMock.mock.calls[0][0] as FormData
    expect(fd.get('rnt_number')).toBeNull()
    expect(fd.get('rnt_document')).toBeNull()
  })
})
