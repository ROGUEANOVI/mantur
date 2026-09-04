import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import EditTransporterProfileForm from './EditTransporterProfileForm'

const updateTransporterProfileMock = vi.fn()

vi.mock('@/app/(app)/mi-perfil-transporte/actions', () => ({
  updateTransporterProfile: (formData: FormData) => updateTransporterProfileMock(formData),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

function pdfFile(name = 'doc.pdf') {
  return new File(['x'], name, { type: 'application/pdf' })
}

const INDEPENDENT_PROPS = {
  currentTier: 'independent' as const,
  verificationStatus: 'pending_review',
  cooperativeName: null,
  cooperativeRntNumber: null,
  cooperativeHabilitacionNumber: null,
  driverLicenseNumber: '12345678',
  driverLicenseExpiry: '2099-01-01',
  soatExpiryDate: '2099-01-01',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('EditTransporterProfileForm', () => {
  it('shows the current verification status', () => {
    render(<EditTransporterProfileForm {...INDEPENDENT_PROPS} />)
    expect(screen.getByText('En revisión')).toBeInTheDocument()
  })

  it('defaults to the tier passed in currentTier and pre-fills its fields', () => {
    render(<EditTransporterProfileForm {...INDEPENDENT_PROPS} />)
    expect(screen.getByLabelText(/número de licencia de conducción/i)).toHaveValue('12345678')
    expect(screen.queryByLabelText(/nombre de la cooperativa/i)).not.toBeInTheDocument()
  })

  it('does not warn about a tier change when the tier is left unchanged', () => {
    render(<EditTransporterProfileForm {...INDEPENDENT_PROPS} />)
    expect(screen.queryByText(/adjunta el documento correspondiente/i)).not.toBeInTheDocument()
  })

  it('warns that a document is required when switching tiers', async () => {
    const user = userEvent.setup()
    render(<EditTransporterProfileForm {...INDEPENDENT_PROPS} />)

    await user.click(screen.getByRole('radio', { name: /cooperativa formal/i }))

    expect(screen.getByText(/adjunta el documento correspondiente/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/nombre de la cooperativa/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/número de licencia de conducción/i)).not.toBeInTheDocument()
  })

  it('submits the selected tier and its fields, without a client-supplied current_tier (server derives that from the DB)', async () => {
    updateTransporterProfileMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<EditTransporterProfileForm {...INDEPENDENT_PROPS} />)

    await user.upload(screen.getByLabelText(/foto de la licencia de conducción/i), pdfFile('lic.pdf'))
    await user.upload(screen.getByLabelText(/foto del soat vigente/i), pdfFile('soat.pdf'))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(updateTransporterProfileMock).toHaveBeenCalledTimes(1)
    const fd = updateTransporterProfileMock.mock.calls[0][0] as FormData
    expect(fd.get('current_tier')).toBeNull()
    expect(fd.get('transport_tier')).toBe('independent')
    expect(fd.get('driver_license_number')).toBe('12345678')
  })

  it('shows the saved message as a toast after a successful save', async () => {
    updateTransporterProfileMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<EditTransporterProfileForm {...INDEPENDENT_PROPS} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('¡Documentos actualizados!'))
  })

  it('shows the server-returned error message as a toast', async () => {
    updateTransporterProfileMock.mockResolvedValue({ error: 'Adjunta el documento correspondiente para cambiar de modalidad.' })
    const user = userEvent.setup()
    render(<EditTransporterProfileForm {...INDEPENDENT_PROPS} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Adjunta el documento correspondiente para cambiar de modalidad.'),
    )
  })

  it('renders cooperative fields pre-filled when currentTier is cooperative', () => {
    render(
      <EditTransporterProfileForm
        {...INDEPENDENT_PROPS}
        currentTier="cooperative"
        cooperativeName="TransManaure"
        cooperativeRntNumber="99999"
        cooperativeHabilitacionNumber="HAB-1"
      />,
    )

    expect(screen.getByLabelText(/nombre de la cooperativa/i)).toHaveValue('TransManaure')
    expect(screen.getByLabelText(/rnt de la cooperativa/i)).toHaveValue('99999')
  })
})
