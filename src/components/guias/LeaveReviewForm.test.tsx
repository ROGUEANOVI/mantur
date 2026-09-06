import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import LeaveReviewForm from './LeaveReviewForm'

const createGuideTourReviewMock = vi.fn()

vi.mock('@/app/(app)/mis-reservas/actions', () => ({
  createGuideTourReview: (formData: FormData) => createGuideTourReviewMock(formData),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const BOOKING_ID = '55555555-5555-5555-5555-555555555555'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LeaveReviewForm', () => {
  it('shows only the toggle button initially', () => {
    render(<LeaveReviewForm bookingId={BOOKING_ID} />)
    expect(screen.getByRole('button', { name: 'Dejar reseña' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/cuéntale a otros turistas/i)).not.toBeInTheDocument()
  })

  it('reveals the form after clicking the toggle, with the submit button disabled until a rating is picked', async () => {
    const user = userEvent.setup()
    render(<LeaveReviewForm bookingId={BOOKING_ID} />)

    await user.click(screen.getByRole('button', { name: 'Dejar reseña' }))

    expect(screen.getByPlaceholderText(/cuéntale a otros turistas/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar reseña' })).toBeDisabled()
  })

  it('enables submit once a star is picked, and submits booking_id/rating/comment', async () => {
    createGuideTourReviewMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<LeaveReviewForm bookingId={BOOKING_ID} />)

    await user.click(screen.getByRole('button', { name: 'Dejar reseña' }))
    await user.click(screen.getByRole('button', { name: '4' }))
    expect(screen.getByRole('button', { name: 'Enviar reseña' })).not.toBeDisabled()

    await user.type(screen.getByPlaceholderText(/cuéntale a otros turistas/i), 'Muy buena experiencia')
    await user.click(screen.getByRole('button', { name: 'Enviar reseña' }))

    expect(createGuideTourReviewMock).toHaveBeenCalledTimes(1)
    const fd = createGuideTourReviewMock.mock.calls[0][0] as FormData
    expect(fd.get('booking_id')).toBe(BOOKING_ID)
    expect(fd.get('rating')).toBe('4')
    expect(fd.get('comment')).toBe('Muy buena experiencia')
  })

  it('shows a success toast and collapses back to the toggle button on success', async () => {
    createGuideTourReviewMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<LeaveReviewForm bookingId={BOOKING_ID} />)

    await user.click(screen.getByRole('button', { name: 'Dejar reseña' }))
    await user.click(screen.getByRole('button', { name: '5' }))
    await user.click(screen.getByRole('button', { name: 'Enviar reseña' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('¡Gracias por tu reseña!'))
    expect(screen.getByRole('button', { name: 'Dejar reseña' })).toBeInTheDocument()
  })

  it('shows the server-returned error as a toast and keeps the form open', async () => {
    createGuideTourReviewMock.mockResolvedValue({ error: 'Ya dejaste una reseña para esta reserva.' })
    const user = userEvent.setup()
    render(<LeaveReviewForm bookingId={BOOKING_ID} />)

    await user.click(screen.getByRole('button', { name: 'Dejar reseña' }))
    await user.click(screen.getByRole('button', { name: '3' }))
    await user.click(screen.getByRole('button', { name: 'Enviar reseña' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Ya dejaste una reseña para esta reserva.'))
    expect(screen.getByRole('button', { name: 'Enviar reseña' })).toBeInTheDocument()
  })

  it('closes and resets the rating when Cancelar is clicked', async () => {
    const user = userEvent.setup()
    render(<LeaveReviewForm bookingId={BOOKING_ID} />)

    await user.click(screen.getByRole('button', { name: 'Dejar reseña' }))
    await user.click(screen.getByRole('button', { name: '5' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.getByRole('button', { name: 'Dejar reseña' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/cuéntale a otros turistas/i)).not.toBeInTheDocument()
  })
})
