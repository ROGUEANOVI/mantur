import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import CreateTourForm from './CreateTourForm'

const createGuideTourMock = vi.fn()

vi.mock('@/app/(app)/mi-perfil-guia/actions', () => ({
  createGuideTour: (formData: FormData) => createGuideTourMock(formData),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CreateTourForm', () => {
  it('defaults capacity to 1', () => {
    render(<CreateTourForm />)
    expect(screen.getByLabelText('Capacidad máxima de personas')).toHaveValue(1)
  })

  it('submits name/description/price/capacity/duration_minutes', async () => {
    createGuideTourMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<CreateTourForm />)

    await user.type(screen.getByLabelText('Nombre del tour'), 'Caminata al mirador')
    await user.type(screen.getByLabelText('Descripción'), 'Una caminata guiada')
    await user.type(screen.getByLabelText('Precio por persona (COP)'), '50000')
    await user.clear(screen.getByLabelText('Capacidad máxima de personas'))
    await user.type(screen.getByLabelText('Capacidad máxima de personas'), '8')
    await user.type(screen.getByLabelText('Duración (minutos)'), '120')
    await user.click(screen.getByRole('button', { name: 'Guardar tour' }))

    expect(createGuideTourMock).toHaveBeenCalledTimes(1)
    const fd = createGuideTourMock.mock.calls[0][0] as FormData
    expect(fd.get('name')).toBe('Caminata al mirador')
    expect(fd.get('description')).toBe('Una caminata guiada')
    expect(fd.get('price')).toBe('50000')
    expect(fd.get('capacity')).toBe('8')
    expect(fd.get('duration_minutes')).toBe('120')
  })

  it('shows the server-returned error message as a toast', async () => {
    createGuideTourMock.mockResolvedValue({ error: 'El nombre del tour es obligatorio.' })
    const user = userEvent.setup()
    render(<CreateTourForm />)

    await user.click(screen.getByRole('button', { name: 'Guardar tour' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('El nombre del tour es obligatorio.'))
  })

  it('shows no error toast before submission', () => {
    render(<CreateTourForm />)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    createGuideTourMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<CreateTourForm />)

    await user.click(screen.getByRole('button', { name: 'Guardar tour' }))

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled()

    resolveAction(undefined)
  })
})
