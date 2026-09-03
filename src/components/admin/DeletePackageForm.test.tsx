import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { toast } from 'sonner'
import DeletePackageForm from './DeletePackageForm'

const deletePackageMock = vi.fn()

vi.mock('@/app/(app)/admin/paquetes/actions', () => ({
  deletePackage: (formData: FormData) => deletePackageMock(formData),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

const PACKAGE_ID = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DeletePackageForm', () => {
  it('renders a hidden form with the given id and packageId, with no visible content', () => {
    const { container } = render(<DeletePackageForm formId="delete-package-1" packageId={PACKAGE_ID} />)
    const form = container.querySelector('form#delete-package-1')
    expect(form).toBeInTheDocument()
    expect(form?.querySelector('input[name="packageId"]')).toHaveValue(PACKAGE_ID)
  })

  it('shows a toast with the server error when deletePackage fails (e.g. package has bookings)', async () => {
    deletePackageMock.mockResolvedValue({ error: 'No se puede eliminar: este paquete ya tiene reservas. Desactívalo en su lugar.' })
    const { container } = render(<DeletePackageForm formId="delete-package-1" packageId={PACKAGE_ID} />)

    const form = container.querySelector('form#delete-package-1') as HTMLFormElement
    form.requestSubmit()

    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'No se puede eliminar: este paquete ya tiene reservas. Desactívalo en su lugar.',
      )
    })
  })

  it('does not toast when deletePackage succeeds', async () => {
    deletePackageMock.mockResolvedValue(undefined)
    const { container } = render(<DeletePackageForm formId="delete-package-1" packageId={PACKAGE_ID} />)

    const form = container.querySelector('form#delete-package-1') as HTMLFormElement
    form.requestSubmit()

    await vi.waitFor(() => {
      expect(deletePackageMock).toHaveBeenCalledTimes(1)
    })
    expect(toast.error).not.toHaveBeenCalled()
  })
})
