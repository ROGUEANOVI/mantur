import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AvatarUploader from './AvatarUploader'

const compressMock = vi.fn()
vi.mock('browser-image-compression', () => ({
  default: (...args: unknown[]) => compressMock(...args),
}))

vi.mock('./AvatarCropDialog', () => ({
  default: ({
    imageSrc,
    open,
    onCancel,
    onConfirm,
  }: {
    imageSrc: string | null
    open: boolean
    onCancel: () => void
    onConfirm: (blob: Blob) => void
  }) =>
    open ? (
      <div data-testid="crop-dialog-mock" data-image-src={imageSrc ?? ''}>
        <button type="button" onClick={onCancel}>
          cancel crop
        </button>
        <button
          type="button"
          onClick={() => onConfirm(new Blob(['cropped'], { type: 'image/png' }))}
        >
          confirm crop
        </button>
      </div>
    ) : null,
}))

function fakeImageFile(type = 'image/jpeg') {
  return new File([new Uint8Array(10)], 'photo.jpg', { type })
}

beforeEach(() => {
  vi.clearAllMocks()
  if (!URL.createObjectURL) {
    URL.createObjectURL = vi.fn()
    URL.revokeObjectURL = vi.fn()
  }
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})

describe('AvatarUploader — fallback and current photo', () => {
  it('shows initials when there is no avatar', () => {
    render(
      <AvatarUploader avatarUrl={null} name="Ana Pérez" uploadAction={vi.fn()} removeAction={vi.fn()} />,
    )
    expect(screen.getByText('AP')).toBeInTheDocument()
  })

  it('renders the current photo when an avatar url is set', () => {
    render(
      <AvatarUploader avatarUrl="https://x/a.webp" name="Ana Pérez" uploadAction={vi.fn()} removeAction={vi.fn()} />,
    )
    expect(screen.getByRole('img', { name: 'Ana Pérez' })).toHaveAttribute('src', 'https://x/a.webp')
  })

  it('does not show "Quitar foto" when there is no avatar', () => {
    render(
      <AvatarUploader avatarUrl={null} name="Ana Pérez" uploadAction={vi.fn()} removeAction={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: 'Quitar foto' })).not.toBeInTheDocument()
  })

  it('falls back to initials when the avatar image fails to load (e.g. blocked or expired url)', () => {
    render(
      <AvatarUploader avatarUrl="https://x/broken.webp" name="Ana Pérez" uploadAction={vi.fn()} removeAction={vi.fn()} />,
    )

    fireEvent.error(screen.getByRole('img', { name: 'Ana Pérez' }))

    expect(screen.getByText('AP')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Ana Pérez' })).not.toBeInTheDocument()
  })

  it('still shows "Quitar foto" after a failed image load — the stored url is still removable', () => {
    render(
      <AvatarUploader avatarUrl="https://x/broken.webp" name="Ana Pérez" uploadAction={vi.fn()} removeAction={vi.fn()} />,
    )

    fireEvent.error(screen.getByRole('img', { name: 'Ana Pérez' }))

    expect(screen.getByRole('button', { name: 'Quitar foto' })).toBeInTheDocument()
  })

  it('recovers from a previous load failure once avatarUrl changes (e.g. after a fresh upload)', () => {
    const { rerender } = render(
      <AvatarUploader avatarUrl="https://x/broken.webp" name="Ana Pérez" uploadAction={vi.fn()} removeAction={vi.fn()} />,
    )
    fireEvent.error(screen.getByRole('img', { name: 'Ana Pérez' }))
    expect(screen.getByText('AP')).toBeInTheDocument()

    rerender(
      <AvatarUploader avatarUrl="https://x/new.webp" name="Ana Pérez" uploadAction={vi.fn()} removeAction={vi.fn()} />,
    )

    expect(screen.getByRole('img', { name: 'Ana Pérez' })).toHaveAttribute('src', 'https://x/new.webp')
  })
})

describe('AvatarUploader — upload flow', () => {
  it('opens the crop dialog after selecting a valid file', async () => {
    const { container } = render(
      <AvatarUploader avatarUrl={null} name="Ana" uploadAction={vi.fn()} removeAction={vi.fn()} />,
    )

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const user = userEvent.setup()
    await user.upload(fileInput, fakeImageFile())

    expect(screen.getByTestId('crop-dialog-mock')).toHaveAttribute(
      'data-image-src',
      'blob:fake-url',
    )
    expect(compressMock).not.toHaveBeenCalled()
  })

  it('compresses the cropped blob to a 512px webp and calls uploadAction after confirming the crop', async () => {
    compressMock.mockResolvedValue(new Blob(['x'], { type: 'image/webp' }))
    const uploadAction = vi.fn().mockResolvedValue(undefined)
    const { container } = render(
      <AvatarUploader avatarUrl={null} name="Ana" uploadAction={uploadAction} removeAction={vi.fn()} />,
    )

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const user = userEvent.setup()
    await user.upload(fileInput, fakeImageFile())
    await user.click(screen.getByRole('button', { name: 'confirm crop' }))

    expect(compressMock).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ maxSizeMB: 0.5, maxWidthOrHeight: 512, fileType: 'image/webp' }),
    )
    expect(uploadAction).toHaveBeenCalledTimes(1)
    const fd = uploadAction.mock.calls[0][0] as FormData
    const uploaded = fd.get('image') as File
    expect(uploaded.type).toBe('image/webp')
  })

  it('leaves the avatar untouched and closes the dialog when the crop is cancelled', async () => {
    const uploadAction = vi.fn()
    const { container } = render(
      <AvatarUploader avatarUrl={null} name="Ana" uploadAction={uploadAction} removeAction={vi.fn()} />,
    )

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const user = userEvent.setup()
    await user.upload(fileInput, fakeImageFile())
    await user.click(screen.getByRole('button', { name: 'cancel crop' }))

    expect(screen.queryByTestId('crop-dialog-mock')).not.toBeInTheDocument()
    expect(compressMock).not.toHaveBeenCalled()
    expect(uploadAction).not.toHaveBeenCalled()

    await user.upload(fileInput, fakeImageFile())
    expect(screen.getByTestId('crop-dialog-mock')).toBeInTheDocument()
  })

  it('rejects an invalid file type before opening the crop dialog', async () => {
    // userEvent.upload enforces the input's `accept` attribute (a real
    // browser file picker would filter these out too), so this exercises
    // the belt-and-suspenders client-side check via a raw change event —
    // simulating an OS file picker that let a mismatched type through.
    const uploadAction = vi.fn()
    const { container } = render(
      <AvatarUploader avatarUrl={null} name="Ana" uploadAction={uploadAction} removeAction={vi.fn()} />,
    )

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = fakeImageFile('application/pdf')
    Object.defineProperty(fileInput, 'files', { value: [file] })
    fireEvent.change(fileInput)

    expect(await screen.findByRole('alert')).toHaveTextContent('Formato no válido. Usa JPEG, PNG o WebP.')
    expect(compressMock).not.toHaveBeenCalled()
    expect(uploadAction).not.toHaveBeenCalled()
  })

  it('shows the server-returned error when the upload fails', async () => {
    compressMock.mockResolvedValue(new Blob(['x'], { type: 'image/webp' }))
    const uploadAction = vi.fn().mockResolvedValue({ error: 'No se pudo subir la foto. Intenta de nuevo.' })
    const { container } = render(
      <AvatarUploader avatarUrl={null} name="Ana" uploadAction={uploadAction} removeAction={vi.fn()} />,
    )

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const user = userEvent.setup()
    await user.upload(fileInput, fakeImageFile())
    await user.click(screen.getByRole('button', { name: 'confirm crop' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo subir la foto. Intenta de nuevo.')
  })

  it('shows a generic error when compression itself fails, without calling uploadAction', async () => {
    compressMock.mockRejectedValue(new Error('compression failed'))
    const uploadAction = vi.fn()
    const { container } = render(
      <AvatarUploader avatarUrl={null} name="Ana" uploadAction={uploadAction} removeAction={vi.fn()} />,
    )

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const user = userEvent.setup()
    await user.upload(fileInput, fakeImageFile())
    await user.click(screen.getByRole('button', { name: 'confirm crop' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Error al procesar la imagen. Intenta de nuevo.')
    expect(uploadAction).not.toHaveBeenCalled()
  })
})

describe('AvatarUploader — remove flow', () => {
  it('calls removeAction when "Quitar foto" is clicked', async () => {
    const removeAction = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <AvatarUploader avatarUrl="https://x/a.webp" name="Ana" uploadAction={vi.fn()} removeAction={removeAction} />,
    )

    await user.click(screen.getByRole('button', { name: 'Quitar foto' }))

    expect(removeAction).toHaveBeenCalledTimes(1)
  })

  it('shows the server-returned error when removal fails', async () => {
    const removeAction = vi.fn().mockResolvedValue({ error: 'Ocurrió un error. Intenta de nuevo.' })
    const user = userEvent.setup()
    render(
      <AvatarUploader avatarUrl="https://x/a.webp" name="Ana" uploadAction={vi.fn()} removeAction={removeAction} />,
    )

    await user.click(screen.getByRole('button', { name: 'Quitar foto' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Ocurrió un error. Intenta de nuevo.')
  })
})
