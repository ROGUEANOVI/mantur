import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TourBookingForm from './TourBookingForm'

const TOUR_ID = '22222222-2222-2222-2222-222222222222'

vi.mock('@/app/(app)/reservas/actions', () => ({
  createGuideTourPrereserva: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

describe('TourBookingForm — access="other_role"', () => {
  it('renders nothing', () => {
    const { container } = render(
      <TourBookingForm
        tourId={TOUR_ID}
        tourName="Chorro de la Vela"
        guideName="María Guía"
        price={50000}
        capacity={8}
        blockedDates={[]}
        access="other_role"
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe.each(['tourist', 'guest'] as const)('TourBookingForm — access="%s"', (access) => {
  it('renders a WhatsApp link to ManTur with a prefilled message including the tour name, guide, and price', () => {
    render(
      <TourBookingForm
        tourId={TOUR_ID}
        tourName="Chorro de la Vela"
        guideName="María Guía"
        price={50000}
        capacity={8}
        blockedDates={[]}
        access={access}
      />,
    )

    const link = screen.getByRole('link', { name: 'Consultar por WhatsApp' })
    expect(link).toHaveAttribute('href', expect.stringContaining('https://wa.me/573217203264?text='))
    const decodedHref = decodeURIComponent(link.getAttribute('href')!)
    expect(decodedHref).toContain('Chorro de la Vela')
    expect(decodedHref).toContain('María Guía')
    expect(decodedHref).toContain('$50.000 COP')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('also renders the pre-reserva form (login link for a guest, real form for a tourist)', () => {
    render(
      <TourBookingForm
        tourId={TOUR_ID}
        tourName="Chorro de la Vela"
        guideName="María Guía"
        price={50000}
        capacity={8}
        blockedDates={[]}
        access={access}
      />,
    )

    if (access === 'guest') {
      expect(screen.getByRole('link', { name: 'Inicia sesión para solicitar este tour' })).toBeInTheDocument()
    } else {
      expect(screen.getByRole('button', { name: 'Solicitar reserva' })).toBeInTheDocument()
    }
  })
})
