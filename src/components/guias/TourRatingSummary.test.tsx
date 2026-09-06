import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TourRatingSummary from './TourRatingSummary'

describe('TourRatingSummary', () => {
  it('shows "no reviews yet" copy when count is 0', () => {
    render(<TourRatingSummary avgRating={null} count={0} />)
    expect(screen.getByText('Aún no tiene reseñas.')).toBeInTheDocument()
  })

  it('shows the average rounded to one decimal and a pluralized count', () => {
    render(<TourRatingSummary avgRating={4.5} count={12} />)
    expect(screen.getByText('4.5')).toBeInTheDocument()
    expect(screen.getByText('(12 reseñas)')).toBeInTheDocument()
  })

  it('uses the singular form for exactly one review', () => {
    render(<TourRatingSummary avgRating={5} count={1} />)
    expect(screen.getByText('(1 reseña)')).toBeInTheDocument()
  })
})
