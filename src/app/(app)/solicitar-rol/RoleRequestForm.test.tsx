import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RoleRequestForm from './RoleRequestForm'

const submitRoleRequestMock = vi.fn()

vi.mock('./actions', () => ({
  submitRoleRequest: (formData: FormData) => submitRoleRequestMock(formData),
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
  { slug: 'resort', name: 'Balneario' },
  { slug: 'restaurant', name: 'Restaurante' },
]

function pdfFile(name = 'doc.pdf') {
  return new File(['dummy'], name, { type: 'application/pdf' })
}

// jsdom never clears an `<input type="file" required>`'s validityState even
// after userEvent.upload sets a real FileList (a known jsdom gap, not a bug
// in the component) — clicking the submit button would be silently blocked
// by the browser's own constraint validation before React ever sees the
// event. Dispatching `submit` directly on the form bypasses that native
// gate, the same workaround used across the ecosystem for this exact issue.
function submitForm(container: HTMLElement) {
  fireEvent.submit(container.querySelector('form')!)
}

// Fills every field the business_owner fieldset now requires (RNT number +
// document), leaving only the caller's own name/phone/category steps to add.
async function fillBusinessOwnerRnt(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/número de registro nacional de turismo/i), '12345')
  await user.upload(screen.getByLabelText(/certificado rnt/i), pdfFile())
}

// Fills every field the tourist_guide fieldset now requires beyond the
// original specialties/languages/phone/experience/bio set.
async function fillTouristGuideCompliance(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/número de registro nacional de turismo/i), '54321')
  await user.upload(screen.getByLabelText(/certificado rnt/i), pdfFile('rnt.pdf'))
  await user.type(screen.getByLabelText(/número de tarjeta profesional/i), 'TP-1')
  await user.upload(screen.getByLabelText(/foto de tu tarjeta profesional/i), pdfFile('tarjeta.pdf'))
}

// Fills the independent-tier transporter fields (the default tier), which is
// now required for the transporter fieldset to pass native form validation.
async function fillTransporterIndependent(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/número de licencia de conducción/i), '12345678')
  await user.type(screen.getByLabelText(/vencimiento de la licencia/i), '2099-01-01')
  await user.upload(screen.getByLabelText(/foto de la licencia de conducción/i), pdfFile('licencia.pdf'))
  await user.type(screen.getByLabelText(/vencimiento del soat/i), '2099-01-01')
  await user.upload(screen.getByLabelText(/foto del soat vigente/i), pdfFile('soat.pdf'))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RoleRequestForm — step 1 (role selection)', () => {
  it('renders a card for each requestable role', () => {
    render(<RoleRequestForm categories={CATEGORIES} />)
    expect(screen.getByText('¿Tienes un negocio en Manaure?')).toBeInTheDocument()
    expect(screen.getByText('¿Ofreces transporte en Manaure?')).toBeInTheDocument()
    expect(screen.getByText('¿Conoces Manaure mejor que nadie?')).toBeInTheDocument()
  })

  it('advances to the role-specific form when a card is clicked', async () => {
    const user = userEvent.setup()
    render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero registrar mi negocio'))

    expect(screen.getByLabelText('Nombre del negocio')).toBeInTheDocument()
    expect(screen.queryByText('¿Ofreces transporte en Manaure?')).not.toBeInTheDocument()
  })
})

describe('RoleRequestForm — step 2 shared behavior', () => {
  it('goes back to role selection when "Elegir otro rol" is clicked', async () => {
    const user = userEvent.setup()
    render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero ofrecer transporte'))
    expect(screen.getByLabelText('Placa del vehículo')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /elegir otro rol/i }))

    expect(screen.getByText('¿Ofreces transporte en Manaure?')).toBeInTheDocument()
  })

  it('includes the selected role as a hidden field', async () => {
    const user = userEvent.setup()
    const { container } = render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero ser guía turístico'))

    expect(container.querySelector('input[name="requested_role"]')).toHaveValue('tourist_guide')
  })

  it('shows the server-returned error message', async () => {
    submitRoleRequestMock.mockResolvedValue({ error: 'Completa todos los campos requeridos.' })
    const user = userEvent.setup()
    const { container } = render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero registrar mi negocio'))
    await user.type(screen.getByLabelText('Nombre del negocio'), 'Finca X')
    await user.type(screen.getByLabelText('Teléfono de contacto'), '3001234567')
    await fillBusinessOwnerRnt(user)
    submitForm(container)

    expect(await screen.findByRole('alert')).toHaveTextContent('Completa todos los campos requeridos.')
  })

  it('shows the pending status screen instead of the form after a successful submission', async () => {
    submitRoleRequestMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    const { container } = render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero registrar mi negocio'))
    await user.type(screen.getByLabelText('Nombre del negocio'), 'Finca X')
    await user.type(screen.getByLabelText('Teléfono de contacto'), '3001234567')
    await fillBusinessOwnerRnt(user)
    submitForm(container)

    expect(await screen.findByText('Solicitud en revisión')).toBeInTheDocument()
    expect(screen.getByText('Tu solicitud fue recibida. El equipo de ManTur la revisará pronto y te notificaremos.')).toBeInTheDocument()
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    submitRoleRequestMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    const { container } = render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero registrar mi negocio'))
    await user.type(screen.getByLabelText('Nombre del negocio'), 'Finca X')
    await user.type(screen.getByLabelText('Teléfono de contacto'), '3001234567')
    await fillBusinessOwnerRnt(user)
    submitForm(container)

    expect(await screen.findByRole('button', { name: 'Enviando...' })).toBeDisabled()

    resolveAction({ success: true })
  })

  it('submits the optional notes field for any role', async () => {
    submitRoleRequestMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    const { container } = render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero registrar mi negocio'))
    await user.type(screen.getByLabelText('Nombre del negocio'), 'Finca X')
    await user.type(screen.getByLabelText('Teléfono de contacto'), '3001234567')
    await fillBusinessOwnerRnt(user)
    await user.type(screen.getByLabelText(/algo más que quieras contarnos/i), 'Disponible fines de semana')
    submitForm(container)

    await vi.waitFor(() => expect(submitRoleRequestMock).toHaveBeenCalled())
    const fd = submitRoleRequestMock.mock.calls[0][0] as FormData
    expect(fd.get('notes')).toBe('Disponible fines de semana')
  })
})

describe('RoleRequestForm — business_owner fields', () => {
  it('renders one checkbox per category', async () => {
    const user = userEvent.setup()
    render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero registrar mi negocio'))

    expect(screen.getByRole('checkbox', { name: 'Balneario' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Restaurante' })).toBeInTheDocument()
  })

  it('renders the RNT number and document fields', async () => {
    const user = userEvent.setup()
    render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero registrar mi negocio'))

    expect(screen.getByLabelText(/número de registro nacional de turismo/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/certificado rnt/i)).toBeInTheDocument()
  })

  it('submits business_name, checked category_slugs, phone, and rnt_number', async () => {
    submitRoleRequestMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    const { container } = render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero registrar mi negocio'))
    await user.type(screen.getByLabelText('Nombre del negocio'), 'Finca La Esperanza')
    await user.click(screen.getByRole('checkbox', { name: 'Balneario' }))
    await user.type(screen.getByLabelText('Teléfono de contacto'), '3001234567')
    await fillBusinessOwnerRnt(user)
    submitForm(container)

    await vi.waitFor(() => expect(submitRoleRequestMock).toHaveBeenCalled())
    const fd = submitRoleRequestMock.mock.calls[0][0] as FormData
    expect(fd.get('requested_role')).toBe('business_owner')
    expect(fd.get('business_name')).toBe('Finca La Esperanza')
    expect(fd.getAll('category_slugs')).toEqual(['resort'])
    expect(fd.get('phone')).toBe('3001234567')
    expect(fd.get('rnt_number')).toBe('12345')
    // The uploaded File's own name/size can't be asserted here: jsdom's
    // FormData-from-form-element construction doesn't faithfully carry a
    // file input's File payload (a known jsdom gap, not app behavior) — the
    // actual document validation logic is covered directly in actions.test.ts,
    // which builds FormData programmatically instead of via form extraction.
    expect(fd.get('rnt_document')).toBeTruthy()
  })

  it('shows an inline error on blur for an invalid phone, without submitting', async () => {
    const user = userEvent.setup()
    render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero registrar mi negocio'))
    await user.type(screen.getByLabelText('Nombre del negocio'), 'Finca La Esperanza')
    await user.click(screen.getByRole('checkbox', { name: 'Balneario' }))
    await user.type(screen.getByLabelText('Teléfono de contacto'), 'abcdefgh')
    await user.tab()

    expect(
      await screen.findByText('Escribe un número de celular colombiano válido (10 dígitos, ej: 300 123 4567).'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))
    expect(submitRoleRequestMock).not.toHaveBeenCalled()
  })
})

describe('RoleRequestForm — transporter fields', () => {
  it('renders the vehicle type select with every option, including buseta', async () => {
    const user = userEvent.setup()
    render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero ofrecer transporte'))

    // The "Tipo de vehículo" <label> has no htmlFor linking it to the
    // <select> — there's only one combobox in this form, so select by role.
    const select = screen.getByRole('combobox') as HTMLSelectElement
    const values = Array.from(select.options).map((o) => o.value)
    expect(values).toEqual(expect.arrayContaining(['motocarro', 'moto', 'camioneta', 'buseta', 'otro']))
  })

  it('defaults to the independent tier and shows SOAT/license fields', async () => {
    const user = userEvent.setup()
    render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero ofrecer transporte'))

    expect(screen.getByLabelText(/número de licencia de conducción/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/vencimiento del soat/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/nombre de la cooperativa/i)).not.toBeInTheDocument()
  })

  it('switches to cooperative fields when that tier is selected, hiding independent fields', async () => {
    const user = userEvent.setup()
    render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero ofrecer transporte'))
    await user.click(screen.getByRole('radio', { name: /cooperativa formal/i }))

    expect(screen.getByLabelText(/nombre de la cooperativa/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/rnt de la cooperativa/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/número de habilitación/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/número de licencia de conducción/i)).not.toBeInTheDocument()
  })

  it('submits license_plate, vehicle_type, phone, and the independent-tier compliance fields', async () => {
    submitRoleRequestMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    const { container } = render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero ofrecer transporte'))
    await user.type(screen.getByLabelText('Placa del vehículo'), 'ABC-123')
    await user.selectOptions(screen.getByRole('combobox'), 'motocarro')
    await user.type(screen.getByLabelText('Teléfono de contacto'), '3009876543')
    await fillTransporterIndependent(user)
    submitForm(container)

    await vi.waitFor(() => expect(submitRoleRequestMock).toHaveBeenCalled())
    const fd = submitRoleRequestMock.mock.calls[0][0] as FormData
    expect(fd.get('requested_role')).toBe('transporter')
    expect(fd.get('license_plate')).toBe('ABC-123')
    expect(fd.get('vehicle_type')).toBe('motocarro')
    expect(fd.get('phone')).toBe('3009876543')
    expect(fd.get('transport_tier')).toBe('independent')
    expect(fd.get('driver_license_number')).toBe('12345678')
    expect(fd.get('soat_expiry_date')).toBe('2099-01-01')
  })

  it('submits cooperative-tier fields when that tier is selected', async () => {
    submitRoleRequestMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    const { container } = render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero ofrecer transporte'))
    await user.type(screen.getByLabelText('Placa del vehículo'), 'XYZ-987')
    await user.selectOptions(screen.getByRole('combobox'), 'buseta')
    await user.type(screen.getByLabelText('Teléfono de contacto'), '3009876543')
    await user.click(screen.getByRole('radio', { name: /cooperativa formal/i }))
    await user.type(screen.getByLabelText(/nombre de la cooperativa/i), 'TransManaure')
    await user.type(screen.getByLabelText(/rnt de la cooperativa/i), '99999')
    await user.type(screen.getByLabelText(/número de habilitación/i), 'HAB-001')
    await user.upload(screen.getByLabelText(/certificado rnt o habilitación/i), pdfFile('cooperativa.pdf'))
    submitForm(container)

    await vi.waitFor(() => expect(submitRoleRequestMock).toHaveBeenCalled())
    const fd = submitRoleRequestMock.mock.calls[0][0] as FormData
    expect(fd.get('transport_tier')).toBe('cooperative')
    expect(fd.get('vehicle_type')).toBe('buseta')
    expect(fd.get('cooperative_name')).toBe('TransManaure')
    expect(fd.get('cooperative_rnt_number')).toBe('99999')
    expect(fd.get('cooperative_habilitacion_number')).toBe('HAB-001')
  })
})

describe('RoleRequestForm — tourist_guide fields', () => {
  it('renders specialty and language checkboxes', async () => {
    const user = userEvent.setup()
    render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero ser guía turístico'))

    expect(screen.getByRole('checkbox', { name: 'Senderismo' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Español' })).toBeInTheDocument()
  })

  it('renders the RNT and Tarjeta Profesional fields', async () => {
    const user = userEvent.setup()
    render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero ser guía turístico'))

    expect(screen.getByLabelText(/número de registro nacional de turismo/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/número de tarjeta profesional/i)).toBeInTheDocument()
  })

  it('submits checked specialties/languages, phone, experience_years, bio, and compliance fields', async () => {
    submitRoleRequestMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    const { container } = render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero ser guía turístico'))
    await user.click(screen.getByRole('checkbox', { name: 'Senderismo' }))
    await user.click(screen.getByRole('checkbox', { name: 'Ecoturismo' }))
    await user.click(screen.getByRole('checkbox', { name: 'Español' }))
    await user.type(screen.getByLabelText('Teléfono de contacto'), '3005551234')
    await user.type(screen.getByLabelText('Años de experiencia'), '5')
    await user.type(screen.getByLabelText('Presentación'), 'Guío caminatas ecológicas desde hace años')
    await fillTouristGuideCompliance(user)
    submitForm(container)

    await vi.waitFor(() => expect(submitRoleRequestMock).toHaveBeenCalled())
    const fd = submitRoleRequestMock.mock.calls[0][0] as FormData
    expect(fd.get('requested_role')).toBe('tourist_guide')
    expect(fd.getAll('specialties').sort()).toEqual(['ecotourism', 'hiking'].sort())
    expect(fd.getAll('languages')).toEqual(['spanish'])
    expect(fd.get('phone')).toBe('3005551234')
    expect(fd.get('experience_years')).toBe('5')
    expect(fd.get('bio')).toBe('Guío caminatas ecológicas desde hace años')
    expect(fd.get('rnt_number')).toBe('54321')
    expect(fd.get('tarjeta_profesional_number')).toBe('TP-1')
  })
})
