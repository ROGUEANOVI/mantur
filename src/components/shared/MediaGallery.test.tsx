import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MediaGallery, { getTileClasses } from './MediaGallery'

const IMAGES = ['https://x/a.webp', 'https://x/b.webp', 'https://x/c.webp']

describe('getTileClasses', () => {
  it('gives the single tile a 16:10 mobile ratio that relaxes on desktop', () => {
    expect(getTileClasses(1, 0)).toContain('col-span-4')
    expect(getTileClasses(1, 0)).toContain('row-span-2')
    expect(getTileClasses(1, 0)).toContain('lg:aspect-auto')
  })

  it('splits two tiles 50/50', () => {
    expect(getTileClasses(2, 0)).toContain('col-span-2')
    expect(getTileClasses(2, 1)).toContain('col-span-2')
  })

  it('widens the two thumbs of a 3-tile gallery to fill the mobile row', () => {
    expect(getTileClasses(3, 1)).toContain('col-span-2')
    expect(getTileClasses(3, 2)).toContain('col-span-2')
  })

  it('keeps thumbs at one column each once there are 4 or more', () => {
    expect(getTileClasses(4, 1)).toContain('col-span-1')
    expect(getTileClasses(5, 4)).toContain('col-span-1')
  })

  it('always gives the main tile (index 0) the 2-row desktop span once there is more than one tile', () => {
    expect(getTileClasses(3, 0)).toContain('lg:row-span-2')
    expect(getTileClasses(5, 0)).toContain('lg:row-span-2')
  })
})

describe('MediaGallery — no media', () => {
  it('renders a placeholder instead of a mosaic', () => {
    const { container } = render(<MediaGallery images={[]} name="Finca X" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('MediaGallery — a single image', () => {
  it('renders one tile and no "ver todas" button', () => {
    render(<MediaGallery images={['https://x/a.webp']} name="Finca X" />)
    expect(screen.getByRole('img', { name: 'Finca X' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver todas las fotos' })).not.toBeInTheDocument()
  })
})

describe('MediaGallery — mosaic tiles', () => {
  it('renders one tile per image, labeling the first plainly and the rest with a photo index', () => {
    render(<MediaGallery images={IMAGES} name="Finca X" />)
    expect(screen.getByRole('button', { name: 'Ver Finca X en tamaño completo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver Finca X — foto 2 en tamaño completo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver Finca X — foto 3 en tamaño completo' })).toBeInTheDocument()
  })

  it('shows a "ver todas las fotos" button once there is more than one slide', () => {
    render(<MediaGallery images={IMAGES} name="Finca X" />)
    expect(screen.getByRole('button', { name: 'Ver todas las fotos' })).toBeInTheDocument()
  })

  it('caps the mosaic at 5 tiles and overlays "+N" on the last one', () => {
    const sevenImages = Array.from({ length: 7 }, (_, i) => `https://x/${i}.webp`)
    render(<MediaGallery images={sevenImages} name="Finca X" />)

    expect(screen.getAllByRole('button', { name: /en tamaño completo|todas las fotos y videos/ })).toHaveLength(5)
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver todas las fotos y videos de Finca X' })).toBeInTheDocument()
  })

  it('does not overlay "+N" when there are 5 or fewer slides', () => {
    const fiveImages = Array.from({ length: 5 }, (_, i) => `https://x/${i}.webp`)
    render(<MediaGallery images={fiveImages} name="Finca X" />)
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument()
  })
})

describe('MediaGallery — videos', () => {
  it('appends video slides after image slides and gives them a play-icon overlay', () => {
    const { container } = render(
      <MediaGallery images={['https://x/a.webp']} videos={['https://x/clip.mp4']} name="Finca X" />,
    )
    const video = container.querySelector('video')
    expect(video).toBeInTheDocument()
    expect(video).toHaveAttribute('src', 'https://x/clip.mp4')
    expect(video).toHaveAttribute('aria-hidden', 'true')
    expect(
      screen.getByRole('button', { name: 'Ver Finca X — video 2 en tamaño completo' }),
    ).toBeInTheDocument()
  })

  it('renders a video-only entity as a single tile', () => {
    const { container } = render(<MediaGallery images={[]} videos={['https://x/clip.mp4']} name="Finca X" />)
    expect(container.querySelector('video')).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeInTheDocument() // play icon, not the empty-state icon
  })
})

describe('MediaGallery — fullscreen grid dialog', () => {
  it('opens when a tile is clicked and lists every slide as its own clickable tile, images and videos alike', async () => {
    const user = userEvent.setup()
    render(<MediaGallery images={IMAGES} videos={['https://x/clip.mp4']} name="Finca X" />)

    await user.click(screen.getAllByRole('button', { name: 'Ver Finca X en tamaño completo' })[0])

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getAllByRole('img')).toHaveLength(3)
    expect(
      within(dialog).getByRole('button', { name: 'Ver Finca X — video 4 en tamaño completo' }),
    ).toBeInTheDocument()
  })

  it('opens from the "ver todas las fotos" button too', async () => {
    const user = userEvent.setup()
    render(<MediaGallery images={IMAGES} name="Finca X" />)

    await user.click(screen.getByRole('button', { name: 'Ver todas las fotos' }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('closes via the dialog close button', async () => {
    const user = userEvent.setup()
    render(<MediaGallery images={IMAGES} name="Finca X" />)

    await user.click(screen.getAllByRole('button', { name: 'Ver Finca X en tamaño completo' })[0])
    await screen.findByRole('dialog')

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('MediaGallery — single-photo lightbox (opened from within the grid)', () => {
  async function openLightboxAt(user: ReturnType<typeof userEvent.setup>, index: number) {
    render(<MediaGallery images={IMAGES} videos={['https://x/clip.mp4']} name="Finca X" />)
    await user.click(screen.getAllByRole('button', { name: 'Ver Finca X en tamaño completo' })[0])
    const dialog = await screen.findByRole('dialog')
    const label =
      index === 0 ? 'Ver Finca X en tamaño completo' : `Ver Finca X — foto ${index + 1} en tamaño completo`
    await user.click(within(dialog).getByRole('button', { name: label }))
  }

  it('opens on the clicked slide, shows a position counter, and only a "next" arrow on the first slide', async () => {
    const user = userEvent.setup()
    await openLightboxAt(user, 0)

    expect(screen.getByRole('dialog', { name: 'Finca X — foto ampliada' })).toBeInTheDocument()
    expect(screen.getByText('1 de 4')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver foto anterior' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver foto siguiente' })).toBeInTheDocument()
  })

  it('navigates forward and backward between slides, including into the video slide', async () => {
    const user = userEvent.setup()
    await openLightboxAt(user, 2)

    expect(screen.getByText('3 de 4')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ver foto siguiente' }))
    expect(screen.getByText('4 de 4')).toBeInTheDocument()
    expect(screen.getByLabelText('Finca X — video 4')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver foto siguiente' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ver foto anterior' }))
    expect(screen.getByText('3 de 4')).toBeInTheDocument()
  })

  it('closes back to the grid (not the whole gallery) via its own close button', async () => {
    const user = userEvent.setup()
    await openLightboxAt(user, 0)

    await user.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(screen.queryByRole('dialog', { name: 'Finca X — foto ampliada' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes back to the grid via Escape', async () => {
    const user = userEvent.setup()
    await openLightboxAt(user, 0)

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: 'Finca X — foto ampliada' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes back to the grid when the backdrop is clicked, but not when the photo itself is clicked', async () => {
    const user = userEvent.setup()
    await openLightboxAt(user, 0)

    await user.click(screen.getByRole('dialog', { name: 'Finca X — foto ampliada' }))
    expect(screen.queryByRole('dialog', { name: 'Finca X — foto ampliada' })).not.toBeInTheDocument()
  })
})
