import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import PackageLeaveReviewForm from './PackageLeaveReviewForm'

const createPackageReviewMock = vi.fn()

vi.mock('@/app/(app)/mis-reservas/actions', () => ({
  createPackageReview: (formData: FormData) => createPackageReviewMock(formData),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const BOOKING_ID = '55555555-5555-5555-5555-555555555555'
const ITEM_1 = { id: '11111111-1111-1111-1111-111111111111', label: 'Tour cascadas — Juan Guía' }
const ITEM_2 = { id: '22222222-2222-2222-2222-222222222222', label: 'Almuerzo — Finca Mary' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PackageLeaveReviewForm', () => {
  it('shows only the toggle button initially', () => {
    render(<PackageLeaveReviewForm bookingId={BOOKING_ID} items={[]} />)
    expect(screen.getByRole('button', { name: 'Dejar reseña' })).toBeInTheDocument()
  })

  it('reveals the form after clicking the toggle, with submit disabled until the global rating is picked', async () => {
    const user = userEvent.setup()
    render(<PackageLeaveReviewForm bookingId={BOOKING_ID} items={[]} />)

    await user.click(screen.getByRole('button', { name: 'Dejar reseña' }))

    expect(screen.getByPlaceholderText(/cuéntale a otros turistas/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar reseña' })).toBeDisabled()
  })

  it('does not render any per-item rows when the package has no items', async () => {
    const user = userEvent.setup()
    render(<PackageLeaveReviewForm bookingId={BOOKING_ID} items={[]} />)
    await user.click(screen.getByRole('button', { name: 'Dejar reseña' }))

    expect(screen.queryByText(ITEM_1.label, { exact: false })).not.toBeInTheDocument()
  })

  it('renders one star row per item, each with its own accessible label', async () => {
    const user = userEvent.setup()
    render(<PackageLeaveReviewForm bookingId={BOOKING_ID} items={[ITEM_1, ITEM_2]} />)
    await user.click(screen.getByRole('button', { name: 'Dejar reseña' }))

    expect(screen.getByText(`Calificación para: ${ITEM_1.label}`)).toBeInTheDocument()
    expect(screen.getByText(`Calificación para: ${ITEM_2.label}`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `${ITEM_1.label}: 5` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `${ITEM_2.label}: 5` })).toBeInTheDocument()
  })

  it('submits booking_id/rating/comment with an empty item_ratings when no item is rated', async () => {
    createPackageReviewMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<PackageLeaveReviewForm bookingId={BOOKING_ID} items={[ITEM_1]} />)

    await user.click(screen.getByRole('button', { name: 'Dejar reseña' }))
    await user.click(screen.getByRole('button', { name: 'Calificación general: 4' }))
    await user.type(screen.getByPlaceholderText(/cuéntale a otros turistas/i), 'Muy buena experiencia')
    await user.click(screen.getByRole('button', { name: 'Enviar reseña' }))

    expect(createPackageReviewMock).toHaveBeenCalledTimes(1)
    const fd = createPackageReviewMock.mock.calls[0][0] as FormData
    expect(fd.get('booking_id')).toBe(BOOKING_ID)
    expect(fd.get('rating')).toBe('4')
    expect(fd.get('comment')).toBe('Muy buena experiencia')
    expect(fd.get('item_ratings')).toBe('{}')
  })

  it('includes only the items the tourist actually rated in item_ratings', async () => {
    createPackageReviewMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<PackageLeaveReviewForm bookingId={BOOKING_ID} items={[ITEM_1, ITEM_2]} />)

    await user.click(screen.getByRole('button', { name: 'Dejar reseña' }))
    await user.click(screen.getByRole('button', { name: 'Calificación general: 5' }))
    await user.click(screen.getByRole('button', { name: `${ITEM_1.label}: 3` }))
    await user.click(screen.getByRole('button', { name: 'Enviar reseña' }))

    const fd = createPackageReviewMock.mock.calls[0][0] as FormData
    expect(JSON.parse(fd.get('item_ratings') as string)).toEqual({ [ITEM_1.id]: 3 })
  })

  it('shows a success toast and collapses back to the toggle button on success', async () => {
    createPackageReviewMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<PackageLeaveReviewForm bookingId={BOOKING_ID} items={[]} />)

    await user.click(screen.getByRole('button', { name: 'Dejar reseña' }))
    await user.click(screen.getByRole('button', { name: 'Calificación general: 5' }))
    await user.click(screen.getByRole('button', { name: 'Enviar reseña' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('¡Gracias por tu reseña!'))
    expect(screen.getByRole('button', { name: 'Dejar reseña' })).toBeInTheDocument()
  })

  it('shows the server-returned error as a toast and keeps the form open', async () => {
    createPackageReviewMock.mockResolvedValue({ error: 'Ya dejaste una reseña para esta reserva.' })
    const user = userEvent.setup()
    render(<PackageLeaveReviewForm bookingId={BOOKING_ID} items={[]} />)

    await user.click(screen.getByRole('button', { name: 'Dejar reseña' }))
    await user.click(screen.getByRole('button', { name: 'Calificación general: 3' }))
    await user.click(screen.getByRole('button', { name: 'Enviar reseña' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Ya dejaste una reseña para esta reserva.'))
    expect(screen.getByRole('button', { name: 'Enviar reseña' })).toBeInTheDocument()
  })

  it('closes and resets both the global and per-item ratings when Cancelar is clicked', async () => {
    const user = userEvent.setup()
    render(<PackageLeaveReviewForm bookingId={BOOKING_ID} items={[ITEM_1]} />)

    await user.click(screen.getByRole('button', { name: 'Dejar reseña' }))
    await user.click(screen.getByRole('button', { name: 'Calificación general: 5' }))
    await user.click(screen.getByRole('button', { name: `${ITEM_1.label}: 4` }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.getByRole('button', { name: 'Dejar reseña' })).toBeInTheDocument()
  })
})
