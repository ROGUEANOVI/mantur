import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { toast } from 'sonner'
import GuideTourPrereservaForm from './GuideTourPrereservaForm'

const createGuideTourPrereservaMock = vi.fn()

vi.mock('@/app/(app)/reservas/actions', () => ({
  createGuideTourPrereserva: (...args: unknown[]) => createGuideTourPrereservaMock(...args),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const TOUR_ID = '22222222-2222-2222-2222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GuideTourPrereservaForm', () => {
  it('renders nothing for a non-tourist role', () => {
    const { container } = render(
      <GuideTourPrereservaForm tourId={TOUR_ID} price={30000} capacity={8} blockedDates={[]} access="other_role" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a login link for a guest', () => {
    render(<GuideTourPrereservaForm tourId={TOUR_ID} price={30000} capacity={8} blockedDates={[]} access="guest" />)
    expect(screen.getByRole('link', { name: 'Inicia sesión para solicitar este tour' })).toHaveAttribute('href', '/login')
  })

  it('submits guide_tour_id, the picked date, people_count, and notes', async () => {
    createGuideTourPrereservaMock.mockResolvedValue(undefined)
    render(<GuideTourPrereservaForm tourId={TOUR_ID} price={30000} capacity={8} blockedDates={[]} access="tourist" />)

    const dayButtons = screen.getAllByRole('button', { name: /: Disponible$/ })
    fireEvent.click(dayButtons[0])

    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar reserva' }))

    expect(createGuideTourPrereservaMock).toHaveBeenCalledTimes(1)
    const fd = createGuideTourPrereservaMock.mock.calls[0][0] as FormData
    expect(fd.get('guide_tour_id')).toBe(TOUR_ID)
    expect(fd.get('people_count')).toBe('2')
    expect(fd.get('booking_date')).toBeTruthy()
  })

  it('caps people_count at the tour capacity', () => {
    render(<GuideTourPrereservaForm tourId={TOUR_ID} price={30000} capacity={3} blockedDates={[]} access="tourist" />)

    const input = screen.getByLabelText('Cantidad') as HTMLInputElement
    fireEvent.change(input, { target: { value: '10' } })

    expect(input.value).toBe('3')
  })

  it('shows a server-returned error as a toast', async () => {
    createGuideTourPrereservaMock.mockResolvedValue({ error: 'Esto no está disponible en este momento.' })
    render(<GuideTourPrereservaForm tourId={TOUR_ID} price={30000} capacity={8} blockedDates={[]} access="tourist" />)

    const dayButtons = screen.getAllByRole('button', { name: /: Disponible$/ })
    fireEvent.click(dayButtons[0])
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar reserva' }))

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Esto no está disponible en este momento.'))
  })
})
