import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import MediaManager from './MediaManager'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const compressMock = vi.fn()
vi.mock('browser-image-compression', () => ({
  default: (...args: unknown[]) => compressMock(...args),
}))

const uploadToSignedUrlMock = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: (bucket: string) => ({
        uploadToSignedUrl: (path: string, token: string, file: unknown) =>
          uploadToSignedUrlMock(bucket, path, token, file),
      }),
    },
  }),
}))

function fakeImageFile() {
  return new File([new Uint8Array(10)], 'photo.jpg', { type: 'image/jpeg' })
}

function fakeVideoFile(overrides: Partial<{ type: string; size: number }> = {}) {
  const size = overrides.size ?? 1024
  const type = overrides.type ?? 'video/mp4'
  return new File([new Uint8Array(size)], 'clip.mp4', { type })
}

function baseProps(overrides: Partial<Parameters<typeof MediaManager>[0]> = {}) {
  return {
    images: [] as string[],
    videos: [] as string[],
    videoBucket: 'business-videos',
    uploadImageAction: vi.fn(),
    deleteImageAction: vi.fn(),
    requestVideoUploadAction: vi.fn(),
    confirmVideoUploadAction: vi.fn(),
    deleteVideoAction: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MediaManager — existing media', () => {
  it('marks only the first item overall as "Portada", images before videos', () => {
    render(
      <MediaManager {...baseProps({ images: ['https://x/a.webp'], videos: ['https://x/b.mp4'] })} />,
    )
    expect(screen.getAllByText('Portada')).toHaveLength(1)
  })

  it('renders a play badge on video tiles', () => {
    const { container } = render(<MediaManager {...baseProps({ videos: ['https://x/clip.mp4'] })} />)
    expect(container.querySelector('video')).toBeInTheDocument()
  })

  it('does not delete immediately, and asks for confirmation first', async () => {
    const deleteImageAction = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<MediaManager {...baseProps({ images: ['https://x/a.webp'], deleteImageAction })} />)

    await user.click(screen.getByRole('button', { name: 'Eliminar imagen' }))

    expect(deleteImageAction).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('calls deleteImageAction once deletion is confirmed', async () => {
    const deleteImageAction = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<MediaManager {...baseProps({ images: ['https://x/a.webp'], deleteImageAction })} />)

    await user.click(screen.getByRole('button', { name: 'Eliminar imagen' }))
    await user.click(screen.getByRole('button', { name: 'Sí, eliminar' }))

    expect(deleteImageAction).toHaveBeenCalledWith('https://x/a.webp')
  })

  it('calls deleteVideoAction once deletion is confirmed', async () => {
    const deleteVideoAction = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<MediaManager {...baseProps({ videos: ['https://x/clip.mp4'], deleteVideoAction })} />)

    await user.click(screen.getByRole('button', { name: 'Eliminar video' }))
    await user.click(screen.getByRole('button', { name: 'Sí, eliminar' }))

    expect(deleteVideoAction).toHaveBeenCalledWith('https://x/clip.mp4')
  })

  it('does not call deleteImageAction when the confirmation dialog is cancelled', async () => {
    const deleteImageAction = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<MediaManager {...baseProps({ images: ['https://x/a.webp'], deleteImageAction })} />)

    await user.click(screen.getByRole('button', { name: 'Eliminar imagen' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(deleteImageAction).not.toHaveBeenCalled()
  })

  it('shows the server-returned error as a toast when deletion fails', async () => {
    const deleteImageAction = vi.fn().mockResolvedValue({ error: 'No se pudo eliminar.' })
    const user = userEvent.setup()
    render(<MediaManager {...baseProps({ images: ['https://x/a.webp'], deleteImageAction })} />)

    await user.click(screen.getByRole('button', { name: 'Eliminar imagen' }))
    await user.click(screen.getByRole('button', { name: 'Sí, eliminar' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se pudo eliminar.'))
  })
})

describe('MediaManager — capacity', () => {
  it('shows the upload control with a combined X/Y counter when under the limit', () => {
    render(<MediaManager {...baseProps({ images: ['https://x/a.webp'], videos: ['https://x/b.mp4'], maxMedia: 10 })} />)
    expect(screen.getByText('Agregar foto o video 2/10')).toBeInTheDocument()
  })

  it('hides the upload control and shows a limit-reached message when at capacity', () => {
    render(
      <MediaManager
        {...baseProps({ images: ['a', 'b'], videos: ['c'], maxMedia: 3 })}
      />,
    )
    expect(screen.queryByText(/agregar foto/i)).not.toBeInTheDocument()
    expect(screen.getByText('Límite alcanzado (3 fotos y videos). Elimina uno para agregar otro.')).toBeInTheDocument()
  })
})

describe('MediaManager — image upload flow', () => {
  it('compresses the selected image and uploads it as webp', async () => {
    compressMock.mockResolvedValue(new Blob(['x'], { type: 'image/webp' }))
    const uploadImageAction = vi.fn().mockResolvedValue(undefined)
    const { container } = render(<MediaManager {...baseProps({ uploadImageAction })} />)

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const user = userEvent.setup()
    await user.upload(fileInput, fakeImageFile())

    expect(compressMock).toHaveBeenCalled()
    expect(uploadImageAction).toHaveBeenCalledTimes(1)
    const fd = uploadImageAction.mock.calls[0][0] as FormData
    const uploaded = fd.get('image') as File
    expect(uploaded.type).toBe('image/webp')
  })

  it('shows the server-returned error as a toast when the image upload fails', async () => {
    compressMock.mockResolvedValue(new Blob(['x'], { type: 'image/webp' }))
    const uploadImageAction = vi.fn().mockResolvedValue({ error: 'No se pudo subir la imagen.' })
    const { container } = render(<MediaManager {...baseProps({ uploadImageAction })} />)

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const user = userEvent.setup()
    await user.upload(fileInput, fakeImageFile())

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se pudo subir la imagen.'))
  })
})

describe('MediaManager — video upload flow', () => {
  it('rejects an unsupported video mime type client-side without calling requestVideoUploadAction', async () => {
    // Uses fireEvent (not userEvent.upload) because userEvent filters files
    // against the input's `accept` attribute before firing change — exactly
    // like a real OS file picker would, so it can never produce this case.
    // A crafted change event (e.g. drag-and-drop) still can, hence the
    // server-side validateVideoMeta backstop this client check mirrors.
    const requestVideoUploadAction = vi.fn()
    const { container } = render(<MediaManager {...baseProps({ requestVideoUploadAction })} />)

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [fakeVideoFile({ type: 'video/avi' })] } })

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Formato no válido. Usa MP4, WebM o QuickTime.'),
    )
    expect(requestVideoUploadAction).not.toHaveBeenCalled()
  })

  it('rejects a video over 50MB client-side without calling requestVideoUploadAction', async () => {
    const requestVideoUploadAction = vi.fn()
    const { container } = render(<MediaManager {...baseProps({ requestVideoUploadAction })} />)

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const user = userEvent.setup()
    await user.upload(fileInput, fakeVideoFile({ size: 51 * 1024 * 1024 }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('El video no puede superar 50 MB.'))
    expect(requestVideoUploadAction).not.toHaveBeenCalled()
  })

  it('runs request -> direct upload -> confirm on a valid video, in order', async () => {
    const requestVideoUploadAction = vi
      .fn()
      .mockResolvedValue({ token: 'tok-1', path: 'businesses/b1/clip.mp4', publicUrl: 'https://cdn.example.com/clip.mp4' })
    uploadToSignedUrlMock.mockResolvedValue({ error: null })
    const confirmVideoUploadAction = vi.fn().mockResolvedValue(undefined)

    const { container } = render(
      <MediaManager {...baseProps({ requestVideoUploadAction, confirmVideoUploadAction, videoBucket: 'business-videos' })} />,
    )

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const user = userEvent.setup()
    const file = fakeVideoFile()
    await user.upload(fileInput, file)

    expect(requestVideoUploadAction).toHaveBeenCalledWith('clip.mp4', 'video/mp4', file.size)
    expect(uploadToSignedUrlMock).toHaveBeenCalledWith('business-videos', 'businesses/b1/clip.mp4', 'tok-1', file)
    expect(confirmVideoUploadAction).toHaveBeenCalledWith('businesses/b1/clip.mp4')
  })

  it('shows the error and stops when requesting the signed URL fails', async () => {
    const requestVideoUploadAction = vi.fn().mockResolvedValue({ error: 'Máximo 10 fotos y videos por negocio.' })
    const { container } = render(<MediaManager {...baseProps({ requestVideoUploadAction })} />)

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const user = userEvent.setup()
    await user.upload(fileInput, fakeVideoFile())

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Máximo 10 fotos y videos por negocio.'))
    expect(uploadToSignedUrlMock).not.toHaveBeenCalled()
  })

  it('shows a generic error and skips confirm when the direct upload to storage fails', async () => {
    const requestVideoUploadAction = vi
      .fn()
      .mockResolvedValue({ token: 'tok-1', path: 'businesses/b1/clip.mp4', publicUrl: 'https://cdn.example.com/clip.mp4' })
    uploadToSignedUrlMock.mockResolvedValue({ error: { message: 'network error' } })
    const confirmVideoUploadAction = vi.fn()

    const { container } = render(
      <MediaManager {...baseProps({ requestVideoUploadAction, confirmVideoUploadAction })} />,
    )

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const user = userEvent.setup()
    await user.upload(fileInput, fakeVideoFile())

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('No se pudo subir el video. Intenta de nuevo.'),
    )
    expect(confirmVideoUploadAction).not.toHaveBeenCalled()
  })

  it('shows the server-returned error as a toast when confirming the video upload fails', async () => {
    const requestVideoUploadAction = vi
      .fn()
      .mockResolvedValue({ token: 'tok-1', path: 'businesses/b1/clip.mp4', publicUrl: 'https://cdn.example.com/clip.mp4' })
    uploadToSignedUrlMock.mockResolvedValue({ error: null })
    const confirmVideoUploadAction = vi.fn().mockResolvedValue({ error: 'No se pudo guardar el video.' })

    const { container } = render(
      <MediaManager {...baseProps({ requestVideoUploadAction, confirmVideoUploadAction })} />,
    )

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const user = userEvent.setup()
    await user.upload(fileInput, fakeVideoFile())

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se pudo guardar el video.'))
  })
})
