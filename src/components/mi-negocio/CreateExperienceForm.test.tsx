import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CreateExperienceForm from './CreateExperienceForm'

const createExperienceMock = vi.fn()

vi.mock('@/app/(app)/mi-negocio/actions', () => ({
  createExperience: (formData: FormData) => createExperienceMock(formData),
}))

const BIZ_ID = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CreateExperienceForm', () => {
  it('includes the businessId as a hidden field', () => {
    const { container } = render(<CreateExperienceForm businessId={BIZ_ID} />)
    const hidden = container.querySelector('input[type="hidden"][name="business_id"]')
    expect(hidden).toHaveValue(BIZ_ID)
  })

  it('submits name/price/capacity/duration_minutes along with the business_id', async () => {
    createExperienceMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<CreateExperienceForm businessId={BIZ_ID} />)

    await user.type(screen.getByLabelText('Nombre'), 'Tour por el río')
    await user.type(screen.getByLabelText('Precio por persona (COP)'), '50000')
    await user.type(screen.getByLabelText('Cupo máximo'), '10')
    await user.type(screen.getByLabelText('Duración (minutos)'), '90')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(createExperienceMock).toHaveBeenCalledTimes(1)
    const fd = createExperienceMock.mock.calls[0][0] as FormData
    expect(fd.get('business_id')).toBe(BIZ_ID)
    expect(fd.get('name')).toBe('Tour por el río')
    expect(fd.get('price')).toBe('50000')
    expect(fd.get('capacity')).toBe('10')
    expect(fd.get('duration_minutes')).toBe('90')
  })

  it('shows the server-returned error message', async () => {
    createExperienceMock.mockResolvedValue({ error: 'Nombre y precio son requeridos. El precio no puede ser negativo.' })
    const user = userEvent.setup()
    render(<CreateExperienceForm businessId={BIZ_ID} />)

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nombre y precio son requeridos. El precio no puede ser negativo.',
    )
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    createExperienceMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<CreateExperienceForm businessId={BIZ_ID} />)

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled()

    resolveAction(undefined)
  })
})
