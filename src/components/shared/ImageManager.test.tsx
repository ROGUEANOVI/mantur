import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ImageManager from './ImageManager'

const compressMock = vi.fn()
vi.mock('browser-image-compression', () => ({
  default: (...args: unknown[]) => compressMock(...args),
}))

function fakeImageFile() {
  return new File([new Uint8Array(10)], 'photo.jpg', { type: 'image/jpeg' })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ImageManager — existing images', () => {
  it('marks only the first image as "Portada"', () => {
    render(
      <ImageManager
        images={['https://x/a.webp', 'https://x/b.webp']}
        uploadAction={vi.fn()}
        deleteAction={vi.fn()}
      />,
    )
    expect(screen.getAllByText('Portada')).toHaveLength(1)
  })

  it('calls deleteAction with the image url when its delete button is clicked', async () => {
    const deleteAction = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <ImageManager images={['https://x/a.webp']} uploadAction={vi.fn()} deleteAction={deleteAction} />,
    )

    await user.click(screen.getByRole('button', { name: 'Eliminar imagen' }))

    expect(deleteAction).toHaveBeenCalledWith('https://x/a.webp')
  })

  it('shows the server-returned error when deletion fails', async () => {
    const deleteAction = vi.fn().mockResolvedValue({ error: 'No se pudo eliminar la imagen.' })
    const user = userEvent.setup()
    render(
      <ImageManager images={['https://x/a.webp']} uploadAction={vi.fn()} deleteAction={deleteAction} />,
    )

    await user.click(screen.getByRole('button', { name: 'Eliminar imagen' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo eliminar la imagen.')
  })
})

describe('ImageManager — upload capacity', () => {
  it('shows the upload control with a X/Y counter when under the limit', () => {
    render(
      <ImageManager
        images={['https://x/a.webp']}
        maxImages={5}
        uploadAction={vi.fn()}
        deleteAction={vi.fn()}
      />,
    )
    expect(screen.getByText('Agregar foto 1/5')).toBeInTheDocument()
  })

  it('hides the upload control and shows a limit-reached message when at capacity', () => {
    render(
      <ImageManager
        images={['a', 'b', 'c']}
        maxImages={3}
        uploadAction={vi.fn()}
        deleteAction={vi.fn()}
      />,
    )
    expect(screen.queryByText(/agregar foto/i)).not.toBeInTheDocument()
    expect(screen.getByText('Límite alcanzado (3 fotos). Elimina una para agregar otra.')).toBeInTheDocument()
  })
})

describe('ImageManager — upload flow', () => {
  it('compresses the selected file and uploads it as webp', async () => {
    compressMock.mockResolvedValue(new Blob(['x'], { type: 'image/webp' }))
    const uploadAction = vi.fn().mockResolvedValue(undefined)
    const { container } = render(
      <ImageManager images={[]} uploadAction={uploadAction} deleteAction={vi.fn()} />,
    )

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const user = userEvent.setup()
    await user.upload(fileInput, fakeImageFile())

    expect(compressMock).toHaveBeenCalled()
    expect(uploadAction).toHaveBeenCalledTimes(1)
    const fd = uploadAction.mock.calls[0][0] as FormData
    const uploaded = fd.get('image') as File
    expect(uploaded.type).toBe('image/webp')
    expect(uploaded.name).toMatch(/\.webp$/)
  })

  it('shows the server-returned error when the upload fails', async () => {
    compressMock.mockResolvedValue(new Blob(['x'], { type: 'image/webp' }))
    const uploadAction = vi.fn().mockResolvedValue({ error: 'No se pudo subir la imagen.' })
    const { container } = render(
      <ImageManager images={[]} uploadAction={uploadAction} deleteAction={vi.fn()} />,
    )

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const user = userEvent.setup()
    await user.upload(fileInput, fakeImageFile())

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo subir la imagen.')
  })

  it('shows a generic error when compression itself fails, without calling uploadAction', async () => {
    compressMock.mockRejectedValue(new Error('compression failed'))
    const uploadAction = vi.fn()
    const { container } = render(
      <ImageManager images={[]} uploadAction={uploadAction} deleteAction={vi.fn()} />,
    )

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const user = userEvent.setup()
    await user.upload(fileInput, fakeImageFile())

    expect(await screen.findByRole('alert')).toHaveTextContent('Error al procesar la imagen. Intenta de nuevo.')
    expect(uploadAction).not.toHaveBeenCalled()
  })

  it('does nothing when the file input change fires with no file selected', () => {
    const { container } = render(
      <ImageManager images={[]} uploadAction={vi.fn()} deleteAction={vi.fn()} />,
    )
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement

    // Firing a bare change event with an empty FileList (no user.upload call)
    // exercises the "no file" early-return branch.
    fileInput.dispatchEvent(new Event('change', { bubbles: true }))

    expect(compressMock).not.toHaveBeenCalled()
  })
})
