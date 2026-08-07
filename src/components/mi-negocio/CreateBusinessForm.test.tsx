import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CreateBusinessForm from './CreateBusinessForm'

const createBusinessMock = vi.fn()

vi.mock('@/app/(app)/mi-negocio/actions', () => ({
  createBusiness: (formData: FormData) => createBusinessMock(formData),
}))

const CATEGORIES = [
  { id: 'cat-1', name: 'Restaurante' },
  { id: 'cat-2', name: 'Finca' },
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

  it('shows the server-returned error message', async () => {
    createBusinessMock.mockResolvedValue({ error: 'Selecciona al menos una categoría.' })
    const user = userEvent.setup()
    render(<CreateBusinessForm categories={CATEGORIES} />)

    await user.type(screen.getByLabelText('Nombre'), 'Finca X')
    await user.click(screen.getByRole('button', { name: 'Crear negocio' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Selecciona al menos una categoría.')
  })

  it('does not render an error before submission', () => {
    render(<CreateBusinessForm categories={CATEGORIES} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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
})
