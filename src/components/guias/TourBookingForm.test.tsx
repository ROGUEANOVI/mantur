import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TourBookingForm from './TourBookingForm'

describe('TourBookingForm — access="other_role"', () => {
  it('renders nothing', () => {
    const { container } = render(
      <TourBookingForm tourName="Chorro de la Vela" guideName="María Guía" price={50000} access="other_role" />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe.each(['tourist', 'guest'] as const)('TourBookingForm — access="%s"', (access) => {
  it('renders a WhatsApp link to ManTur with a prefilled message including the tour name, guide, and price', () => {
    render(<TourBookingForm tourName="Chorro de la Vela" guideName="María Guía" price={50000} access={access} />)

    const link = screen.getByRole('link', { name: 'Consultar por WhatsApp' })
    expect(link).toHaveAttribute('href', expect.stringContaining('https://wa.me/573217203264?text='))
    const decodedHref = decodeURIComponent(link.getAttribute('href')!)
    expect(decodedHref).toContain('Chorro de la Vela')
    expect(decodedHref).toContain('María Guía')
    expect(decodedHref).toContain('$50.000 COP')
    expect(link).toHaveAttribute('target', '_blank')
  })
})
