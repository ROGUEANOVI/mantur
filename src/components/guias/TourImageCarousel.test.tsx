import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TourImageCarousel from './TourImageCarousel'

const IMAGES = ['https://example.com/1.jpg', 'https://example.com/2.jpg', 'https://example.com/3.jpg']

describe('TourImageCarousel', () => {
  it('renders nothing when there are no images', () => {
    const { container } = render(<TourImageCarousel images={[]} name="Caminata a Los Pinos" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the single image with no arrows or dots when there is only one', () => {
    render(<TourImageCarousel images={[IMAGES[0]]} name="Caminata a Los Pinos" />)
    expect(screen.getByAltText('Caminata a Los Pinos')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Foto anterior' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Foto siguiente' })).not.toBeInTheDocument()
  })

  it('shows arrows and dots when there are multiple images', () => {
    render(<TourImageCarousel images={IMAGES} name="Caminata a Los Pinos" />)
    expect(screen.getByRole('button', { name: 'Foto anterior' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Foto siguiente' })).toBeInTheDocument()
  })

  it('cycles forward through images, wrapping back to the first', async () => {
    const user = userEvent.setup()
    render(<TourImageCarousel images={IMAGES} name="Caminata a Los Pinos" />)

    expect(screen.getByAltText('Caminata a Los Pinos')).toHaveAttribute('src', expect.stringContaining(encodeURIComponent(IMAGES[0])))

    await user.click(screen.getByRole('button', { name: 'Foto siguiente' }))
    expect(screen.getByAltText('Caminata a Los Pinos — foto 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Foto siguiente' }))
    expect(screen.getByAltText('Caminata a Los Pinos — foto 3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Foto siguiente' }))
    expect(screen.getByAltText('Caminata a Los Pinos')).toBeInTheDocument()
  })

  it('cycles backward, wrapping to the last image', async () => {
    const user = userEvent.setup()
    render(<TourImageCarousel images={IMAGES} name="Caminata a Los Pinos" />)

    await user.click(screen.getByRole('button', { name: 'Foto anterior' }))
    expect(screen.getByAltText('Caminata a Los Pinos — foto 3')).toBeInTheDocument()
  })
})
