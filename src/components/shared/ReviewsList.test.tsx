import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ReviewsList from './ReviewsList'

describe('ReviewsList', () => {
  it('renders nothing when there are no reviews (RatingSummary already covers the empty state)', () => {
    const { container } = render(<ReviewsList reviews={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a comment when present', () => {
    render(<ReviewsList reviews={[{ rating: 5, comment: 'Excelente experiencia', created_at: '2026-08-20T00:00:00.000Z' }]} />)
    expect(screen.getByText('Excelente experiencia')).toBeInTheDocument()
  })

  it('omits the comment paragraph when null', () => {
    const { container } = render(
      <ReviewsList reviews={[{ rating: 4, comment: null, created_at: '2026-08-20T00:00:00.000Z' }]} />,
    )
    expect(container.querySelectorAll('p')).toHaveLength(0)
  })

  it('renders one list item per review', () => {
    render(
      <ReviewsList
        reviews={[
          { rating: 5, comment: 'Genial', created_at: '2026-08-20T00:00:00.000Z' },
          { rating: 3, comment: null, created_at: '2026-08-15T00:00:00.000Z' },
        ]}
      />,
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })
})
