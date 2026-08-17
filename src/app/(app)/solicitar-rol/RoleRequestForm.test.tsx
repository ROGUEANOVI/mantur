import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RoleRequestForm from './RoleRequestForm'

const submitRoleRequestMock = vi.fn()

vi.mock('./actions', () => ({
  submitRoleRequest: (formData: FormData) => submitRoleRequestMock(formData),
}))

const CATEGORIES = [
  { slug: 'resort', name: 'Balneario' },
  { slug: 'restaurant', name: 'Restaurante' },
]

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
    render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero registrar mi negocio'))
    await user.type(screen.getByLabelText('Nombre del negocio'), 'Finca X')
    await user.type(screen.getByLabelText('Teléfono de contacto'), '3001234567')
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Completa todos los campos requeridos.')
  })

  it('shows the pending status screen instead of the form after a successful submission', async () => {
    submitRoleRequestMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero registrar mi negocio'))
    await user.type(screen.getByLabelText('Nombre del negocio'), 'Finca X')
    await user.type(screen.getByLabelText('Teléfono de contacto'), '3001234567')
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

    expect(await screen.findByText('Solicitud en revisión')).toBeInTheDocument()
    expect(screen.getByText('Tu solicitud fue recibida. El equipo de ManTur la revisará pronto y te notificaremos.')).toBeInTheDocument()
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    submitRoleRequestMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero registrar mi negocio'))
    await user.type(screen.getByLabelText('Nombre del negocio'), 'Finca X')
    await user.type(screen.getByLabelText('Teléfono de contacto'), '3001234567')
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

    expect(await screen.findByRole('button', { name: 'Enviando...' })).toBeDisabled()

    resolveAction({ success: true })
  })

  it('submits the optional notes field for any role', async () => {
    submitRoleRequestMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero registrar mi negocio'))
    await user.type(screen.getByLabelText('Nombre del negocio'), 'Finca X')
    await user.type(screen.getByLabelText('Teléfono de contacto'), '3001234567')
    await user.type(screen.getByLabelText(/algo más que quieras contarnos/i), 'Disponible fines de semana')
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

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

  it('submits business_name, checked category_slugs, and phone', async () => {
    submitRoleRequestMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero registrar mi negocio'))
    await user.type(screen.getByLabelText('Nombre del negocio'), 'Finca La Esperanza')
    await user.click(screen.getByRole('checkbox', { name: 'Balneario' }))
    await user.type(screen.getByLabelText('Teléfono de contacto'), '3001234567')
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

    const fd = submitRoleRequestMock.mock.calls[0][0] as FormData
    expect(fd.get('requested_role')).toBe('business_owner')
    expect(fd.get('business_name')).toBe('Finca La Esperanza')
    expect(fd.getAll('category_slugs')).toEqual(['resort'])
    expect(fd.get('phone')).toBe('3001234567')
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
  it('renders the vehicle type select with every option', async () => {
    const user = userEvent.setup()
    render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero ofrecer transporte'))

    // The "Tipo de vehículo" <label> has no htmlFor linking it to the
    // <select> — there's only one combobox in this form, so select by role.
    const select = screen.getByRole('combobox') as HTMLSelectElement
    const values = Array.from(select.options).map((o) => o.value)
    expect(values).toEqual(expect.arrayContaining(['motocarro', 'moto', 'camioneta', 'otro']))
  })

  it('submits license_plate, vehicle_type, and phone', async () => {
    submitRoleRequestMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero ofrecer transporte'))
    await user.type(screen.getByLabelText('Placa del vehículo'), 'ABC-123')
    await user.selectOptions(screen.getByRole('combobox'), 'motocarro')
    await user.type(screen.getByLabelText('Teléfono de contacto'), '3009876543')
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

    const fd = submitRoleRequestMock.mock.calls[0][0] as FormData
    expect(fd.get('requested_role')).toBe('transporter')
    expect(fd.get('license_plate')).toBe('ABC-123')
    expect(fd.get('vehicle_type')).toBe('motocarro')
    expect(fd.get('phone')).toBe('3009876543')
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

  it('submits checked specialties/languages, phone, experience_years, and bio', async () => {
    submitRoleRequestMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<RoleRequestForm categories={CATEGORIES} />)

    await user.click(screen.getByText('Quiero ser guía turístico'))
    await user.click(screen.getByRole('checkbox', { name: 'Senderismo' }))
    await user.click(screen.getByRole('checkbox', { name: 'Ecoturismo' }))
    await user.click(screen.getByRole('checkbox', { name: 'Español' }))
    await user.type(screen.getByLabelText('Teléfono de contacto'), '3005551234')
    await user.type(screen.getByLabelText('Años de experiencia'), '5')
    await user.type(screen.getByLabelText('Presentación'), 'Guío caminatas ecológicas desde hace años')
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

    const fd = submitRoleRequestMock.mock.calls[0][0] as FormData
    expect(fd.get('requested_role')).toBe('tourist_guide')
    expect(fd.getAll('specialties').sort()).toEqual(['ecotourism', 'hiking'].sort())
    expect(fd.getAll('languages')).toEqual(['spanish'])
    expect(fd.get('phone')).toBe('3005551234')
    expect(fd.get('experience_years')).toBe('5')
    expect(fd.get('bio')).toBe('Guío caminatas ecológicas desde hace años')
  })
})
