import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import AvatarCropDialog from './AvatarCropDialog'

const getCroppedBlobMock = vi.fn()
vi.mock('@/lib/cropImage', () => ({
  getCroppedBlob: (...args: unknown[]) => getCroppedBlobMock(...args),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('react-easy-crop', () => ({
  default: ({
    onCropComplete,
  }: {
    onCropComplete: (croppedArea: unknown, croppedAreaPixels: unknown) => void
  }) => (
    <button
      type="button"
      data-testid="cropper-mock"
      onClick={() => onCropComplete({}, { x: 1, y: 2, width: 100, height: 100 })}
    >
      drag crop
    </button>
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AvatarCropDialog', () => {
  it('renders nothing when there is no image selected', () => {
    render(
      <AvatarCropDialog imageSrc={null} open={false} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    )
    expect(screen.queryByText('Ajusta tu foto')).not.toBeInTheDocument()
  })

  it('calls onCancel when "Cancelar" is clicked', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <AvatarCropDialog imageSrc="blob:fake" open onCancel={onCancel} onConfirm={vi.fn()} />,
    )

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('crops the image and calls onConfirm with the resulting blob', async () => {
    const blob = new Blob(['x'], { type: 'image/png' })
    getCroppedBlobMock.mockResolvedValue(blob)
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <AvatarCropDialog imageSrc="blob:fake" open onCancel={vi.fn()} onConfirm={onConfirm} />,
    )

    await user.click(screen.getByTestId('cropper-mock'))
    await user.click(screen.getByRole('button', { name: 'Usar foto' }))

    expect(getCroppedBlobMock).toHaveBeenCalledWith('blob:fake', {
      x: 1,
      y: 2,
      width: 100,
      height: 100,
    })
    expect(onConfirm).toHaveBeenCalledWith(blob)
  })

  it('disables "Usar foto" until the crop area is known', () => {
    render(
      <AvatarCropDialog imageSrc="blob:fake" open onCancel={vi.fn()} onConfirm={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: 'Usar foto' })).toBeDisabled()
  })

  it('shows an error toast and does not call onConfirm when cropping fails', async () => {
    getCroppedBlobMock.mockRejectedValue(new Error('boom'))
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <AvatarCropDialog imageSrc="blob:fake" open onCancel={vi.fn()} onConfirm={onConfirm} />,
    )

    await user.click(screen.getByTestId('cropper-mock'))
    await user.click(screen.getByRole('button', { name: 'Usar foto' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('No se pudo recortar la imagen. Intenta de nuevo.'),
    )
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
