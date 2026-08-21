import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EditGuideProfileForm from './EditGuideProfileForm'

const updateGuideProfileMock = vi.fn()

vi.mock('@/app/(app)/mi-perfil-guia/actions', () => ({
  updateGuideProfile: (formData: FormData) => updateGuideProfileMock(formData),
}))

const DEFAULT_PROPS = {
  phone: '3001234567',
  bio: 'Guía local con 5 años de experiencia',
  specialties: ['hiking', 'ecotourism'],
  languages: ['spanish'],
  rntNumber: '12345',
  tarjetaProfesionalNumber: 'TP-1',
  verificationStatus: 'pending_review',
}

function pdfFile(name = 'doc.pdf') {
  return new File(['x'], name, { type: 'application/pdf' })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('EditGuideProfileForm', () => {
  it('pre-populates phone and bio', () => {
    render(<EditGuideProfileForm {...DEFAULT_PROPS} />)
    expect(screen.getByLabelText('Teléfono de contacto (WhatsApp)')).toHaveValue('3001234567')
    expect(screen.getByLabelText('Bio')).toHaveValue('Guía local con 5 años de experiencia')
  })

  it('renders an empty bio when the default is null', () => {
    render(<EditGuideProfileForm {...DEFAULT_PROPS} bio={null} />)
    expect(screen.getByLabelText('Bio')).toHaveValue('')
  })

  it('pre-checks only the given specialties and languages', () => {
    render(<EditGuideProfileForm {...DEFAULT_PROPS} />)

    expect(screen.getByRole('checkbox', { name: 'Senderismo' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Ecoturismo' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Historia y cultura' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Español' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Inglés' })).not.toBeChecked()
  })

  it('submits phone, bio, and the checked specialties/languages', async () => {
    updateGuideProfileMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<EditGuideProfileForm {...DEFAULT_PROPS} />)

    await user.click(screen.getByRole('checkbox', { name: 'Fotografía de paisajes' }))
    await user.click(screen.getByRole('checkbox', { name: 'Inglés' }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(updateGuideProfileMock).toHaveBeenCalledTimes(1)
    const fd = updateGuideProfileMock.mock.calls[0][0] as FormData
    expect(fd.get('phone')).toBe('3001234567')
    expect(fd.getAll('specialties').sort()).toEqual(['ecotourism', 'hiking', 'photography'].sort())
    expect(fd.getAll('languages').sort()).toEqual(['english', 'spanish'].sort())
  })

  it('shows a saved message and no error after a successful save', async () => {
    updateGuideProfileMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<EditGuideProfileForm {...DEFAULT_PROPS} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('¡Perfil actualizado!')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the error message when the save fails', async () => {
    updateGuideProfileMock.mockResolvedValue({ error: 'Ocurrió un error. Intenta de nuevo.' })
    const user = userEvent.setup()
    render(<EditGuideProfileForm {...DEFAULT_PROPS} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Ocurrió un error. Intenta de nuevo.')
    expect(screen.queryByText('¡Perfil actualizado!')).not.toBeInTheDocument()
  })

  it('shows the current verification status and pre-fills RNT/Tarjeta numbers', () => {
    render(<EditGuideProfileForm {...DEFAULT_PROPS} />)
    expect(screen.getByText('En revisión')).toBeInTheDocument()
    expect(screen.getByLabelText(/número de registro nacional de turismo/i)).toHaveValue('12345')
    expect(screen.getByLabelText(/número de tarjeta profesional/i)).toHaveValue('TP-1')
  })

  it('submits a re-uploaded RNT document without requiring the Tarjeta fields', async () => {
    updateGuideProfileMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<EditGuideProfileForm {...DEFAULT_PROPS} />)

    await user.clear(screen.getByLabelText(/número de registro nacional de turismo/i))
    await user.type(screen.getByLabelText(/número de registro nacional de turismo/i), '99999')
    await user.upload(screen.getByLabelText(/certificado rnt/i), pdfFile('rnt-nuevo.pdf'))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(updateGuideProfileMock).toHaveBeenCalledTimes(1)
    const fd = updateGuideProfileMock.mock.calls[0][0] as FormData
    expect(fd.get('rnt_number')).toBe('99999')
    expect(fd.get('rnt_document')).toBeTruthy()
  })

  it('renders a back link to the guide panel', () => {
    render(<EditGuideProfileForm {...DEFAULT_PROPS} />)
    expect(screen.getByRole('link', { name: /volver a mi panel/i })).toHaveAttribute('href', '/mi-perfil-guia')
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    updateGuideProfileMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<EditGuideProfileForm {...DEFAULT_PROPS} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled()

    resolveAction({ success: true })
  })
})
