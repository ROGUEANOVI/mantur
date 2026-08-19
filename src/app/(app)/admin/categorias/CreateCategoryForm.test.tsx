import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CreateCategoryForm from './CreateCategoryForm'

const createCategoryMock = vi.fn()
const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()

vi.mock('./actions', () => ({
  createCategory: (formData: FormData) => createCategoryMock(formData),
}))

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CreateCategoryForm', () => {
  it('submits the typed name to createCategory', async () => {
    createCategoryMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<CreateCategoryForm />)

    await user.type(screen.getByPlaceholderText('Ej: Cabaña'), 'Cabaña rústica')
    await user.click(screen.getByRole('button', { name: /agregar/i }))

    expect(createCategoryMock).toHaveBeenCalledTimes(1)
    const fd = createCategoryMock.mock.calls[0][0] as FormData
    expect(fd.get('name')).toBe('Cabaña rústica')
  })

  it('shows the server-returned error as a toast', async () => {
    createCategoryMock.mockResolvedValue({ error: 'Ya existe una categoría con ese slug.' })
    const user = userEvent.setup()
    render(<CreateCategoryForm />)

    await user.type(screen.getByPlaceholderText('Ej: Cabaña'), 'Cabaña')
    await user.click(screen.getByRole('button', { name: /agregar/i }))

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Ya existe una categoría con ese slug.'),
    )
    expect(toastSuccessMock).not.toHaveBeenCalled()
  })

  it('shows a success toast and clears the input after a successful submission', async () => {
    createCategoryMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<CreateCategoryForm />)

    const input = screen.getByPlaceholderText('Ej: Cabaña')
    await user.type(input, 'Cabaña rústica')
    await user.click(screen.getByRole('button', { name: /agregar/i }))

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith('Categoría creada correctamente.'),
    )
    expect(input).toHaveValue('')
  })

  it('shows no toast before submission', () => {
    render(<CreateCategoryForm />)
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    createCategoryMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<CreateCategoryForm />)

    await user.type(screen.getByPlaceholderText('Ej: Cabaña'), 'Cabaña')
    await user.click(screen.getByRole('button', { name: /agregar/i }))

    expect(await screen.findByRole('button', { name: 'Agregando...' })).toBeDisabled()

    resolveAction({ success: true })
  })
})
