import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import TransportRequestForm from './TransportRequestForm'

const createTransportRequestMock = vi.fn()

vi.mock('@/app/(app)/transporte/actions', () => ({
  createTransportRequest: (...args: unknown[]) => createTransportRequestMock(...args),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

async function fillRequiredFields(container: HTMLElement, user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/punto de recogida/i), 'Hotel El Paraíso')
  await user.type(screen.getByLabelText(/destino/i), 'Balneario El Edén')
  const datetimeInput = container.querySelector('input[name="requested_datetime"]') as HTMLInputElement
  fireEvent.change(datetimeInput, { target: { value: datetimeInput.min } })
}

describe('TransportRequestForm', () => {
  it('defaults people_count to 1 and sets a minimum datetime in the near future', () => {
    render(<TransportRequestForm />)
    expect(screen.getByLabelText('Número de personas')).toHaveValue(1)

    const datetimeInput = screen.getByLabelText(/fecha y hora/i) as HTMLInputElement
    expect(datetimeInput.min.length).toBeGreaterThan(0)
  })

  it('submits origin, destination, requested_datetime, people_count, and notes', async () => {
    createTransportRequestMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    const { container } = render(<TransportRequestForm />)

    await fillRequiredFields(container, user)
    await user.type(screen.getByLabelText(/información adicional/i), 'Somos 2 adultos')
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

    expect(createTransportRequestMock).toHaveBeenCalledTimes(1)
    // createTransportRequest is passed directly as the useActionState action,
    // so it receives (prevState, formData) — formData is the second argument.
    const fd = createTransportRequestMock.mock.calls[0][1] as FormData
    expect(fd.get('origin')).toBe('Hotel El Paraíso')
    expect(fd.get('destination')).toBe('Balneario El Edén')
    expect(fd.get('people_count')).toBe('1')
    expect(fd.get('notes')).toBe('Somos 2 adultos')
  })

  it('shows the server-returned error message as a toast', async () => {
    createTransportRequestMock.mockResolvedValue({ error: 'Ocurrió un error. Intenta de nuevo.' })
    const user = userEvent.setup()
    const { container } = render(<TransportRequestForm />)

    await fillRequiredFields(container, user)
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Ocurrió un error. Intenta de nuevo.'))
  })

  it('shows no error toast before submission', () => {
    render(<TransportRequestForm />)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    createTransportRequestMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    const { container } = render(<TransportRequestForm />)

    await fillRequiredFields(container, user)
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

    expect(await screen.findByRole('button', { name: 'Enviando...' })).toBeDisabled()

    resolveAction(undefined)
  })
})
