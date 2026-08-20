import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DetailSplitLayout from './DetailSplitLayout'

describe('DetailSplitLayout', () => {
  it('renders both the gallery and the info slot, gallery first', () => {
    const { container } = render(
      <DetailSplitLayout gallery={<div data-testid="gallery">Gallery</div>}>
        <div data-testid="info">Info</div>
      </DetailSplitLayout>,
    )

    expect(screen.getByTestId('gallery')).toBeInTheDocument()
    expect(screen.getByTestId('info')).toBeInTheDocument()

    const gallery = screen.getByTestId('gallery')
    const info = screen.getByTestId('info')
    expect(
      gallery.compareDocumentPosition(info) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(container.firstChild).toHaveClass('lg:grid')
  })

  it('keeps the gallery column sticky, not the info column', () => {
    render(
      <DetailSplitLayout gallery={<div data-testid="gallery">Gallery</div>}>
        <div data-testid="info">Info</div>
      </DetailSplitLayout>,
    )

    expect(screen.getByTestId('gallery').parentElement).toHaveClass('lg:sticky')
    expect(screen.getByTestId('info').parentElement).not.toHaveClass('lg:sticky')
  })
})
