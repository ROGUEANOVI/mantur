import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import LeaveTransporterReviewForm from './LeaveTransporterReviewForm'

const createTransporterReviewMock = vi.fn()

vi.mock('@/app/(app)/transporte/actions', () => ({
  createTransporterReview: (formData: FormData) => createTransporterReviewMock(formData),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const REQUEST_ID = '55555555-5555-5555-5555-555555555555'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LeaveTransporterReviewForm', () => {
  it('shows only the toggle button initially', () => {
    render(<LeaveTransporterReviewForm transportRequestId={REQUEST_ID} />)
    expect(screen.getByRole('button', { name: 'Dejar reseña' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/cuéntale a otros turistas/i)).not.toBeInTheDocument()
  })

  it('reveals the form after clicking the toggle, with the submit button disabled until a rating is picked', async () => {
    const user = userEvent.setup()
    render(<LeaveTransporterReviewForm transportRequestId={REQUEST_ID} />)

    await user.click(screen.getByRole('button', { name: 'Dejar reseña' }))

    expect(screen.getByPlaceholderText(/cuéntale a otros turistas/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar reseña' })).toBeDisabled()
  })

  it('enables submit once a star is picked, and submits transport_request_id/rating/comment', async () => {
    createTransporterReviewMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<LeaveTransporterReviewForm transportRequestId={REQUEST_ID} />)

    await user.click(screen.getByRole('button', { name: 'Dejar reseña' }))
    await user.click(screen.getByRole('button', { name: '4' }))
    expect(screen.getByRole('button', { name: 'Enviar reseña' })).not.toBeDisabled()

    await user.type(screen.getByPlaceholderText(/cuéntale a otros turistas/i), 'Muy buen viaje')
    await user.click(screen.getByRole('button', { name: 'Enviar reseña' }))

    expect(createTransporterReviewMock).toHaveBeenCalledTimes(1)
    const fd = createTransporterReviewMock.mock.calls[0][0] as FormData
    expect(fd.get('transport_request_id')).toBe(REQUEST_ID)
    expect(fd.get('rating')).toBe('4')
    expect(fd.get('comment')).toBe('Muy buen viaje')
  })

  it('shows a success toast and collapses back to the toggle button on success', async () => {
    createTransporterReviewMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<LeaveTransporterReviewForm transportRequestId={REQUEST_ID} />)

    await user.click(screen.getByRole('button', { name: 'Dejar reseña' }))
    await user.click(screen.getByRole('button', { name: '5' }))
    await user.click(screen.getByRole('button', { name: 'Enviar reseña' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('¡Gracias por tu reseña!'))
    expect(screen.getByRole('button', { name: 'Dejar reseña' })).toBeInTheDocument()
  })

  it('shows the server-returned error as a toast and keeps the form open', async () => {
    createTransporterReviewMock.mockResolvedValue({ error: 'Ya dejaste una reseña para este traslado.' })
    const user = userEvent.setup()
    render(<LeaveTransporterReviewForm transportRequestId={REQUEST_ID} />)

    await user.click(screen.getByRole('button', { name: 'Dejar reseña' }))
    await user.click(screen.getByRole('button', { name: '3' }))
    await user.click(screen.getByRole('button', { name: 'Enviar reseña' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Ya dejaste una reseña para este traslado.'))
    expect(screen.getByRole('button', { name: 'Enviar reseña' })).toBeInTheDocument()
  })

  it('closes and resets the rating when Cancelar is clicked', async () => {
    const user = userEvent.setup()
    render(<LeaveTransporterReviewForm transportRequestId={REQUEST_ID} />)

    await user.click(screen.getByRole('button', { name: 'Dejar reseña' }))
    await user.click(screen.getByRole('button', { name: '5' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.getByRole('button', { name: 'Dejar reseña' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/cuéntale a otros turistas/i)).not.toBeInTheDocument()
  })
})
