import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RatingSummary from './RatingSummary'

const reviewCountText = (n: number) => (n === 1 ? '1 reseña' : `${n} reseñas`)

describe('RatingSummary', () => {
  it('shows the caller-supplied "no reviews yet" copy when count is 0', () => {
    render(<RatingSummary avgRating={null} count={0} noReviewsText="Aún no tiene reseñas." reviewCountText={reviewCountText} />)
    expect(screen.getByText('Aún no tiene reseñas.')).toBeInTheDocument()
  })

  it('shows the average rounded to one decimal and the caller-supplied count label', () => {
    render(<RatingSummary avgRating={4.5} count={12} noReviewsText="Sin reseñas" reviewCountText={reviewCountText} />)
    expect(screen.getByText('4.5')).toBeInTheDocument()
    expect(screen.getByText('(12 reseñas)')).toBeInTheDocument()
  })

  it('uses whatever singular form the caller supplies for exactly one review', () => {
    render(<RatingSummary avgRating={5} count={1} noReviewsText="Sin reseñas" reviewCountText={reviewCountText} />)
    expect(screen.getByText('(1 reseña)')).toBeInTheDocument()
  })

  it('supports a different copy per surface (e.g. packages vs. guide tours)', () => {
    render(
      <RatingSummary
        avgRating={3}
        count={2}
        noReviewsText="Sin calificar"
        reviewCountText={(n) => `${n} calificaciones`}
      />,
    )
    expect(screen.getByText('(2 calificaciones)')).toBeInTheDocument()
  })
})
