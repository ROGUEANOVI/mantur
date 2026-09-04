'use client'

import { useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getCroppedBlob } from '@/lib/cropImage'
import { profileCopy } from '@/lib/copy/profile'

const copy = profileCopy.avatar
const errors = profileCopy.errors

type Props = {
  imageSrc: string | null
  open: boolean
  onCancel: () => void
  onConfirm: (blob: Blob) => void
}

export default function AvatarCropDialog({ imageSrc, open, onCancel, onConfirm }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedArea, setCroppedArea] = useState<Area | null>(null)
  const [processing, setProcessing] = useState(false)

  function handleOpenChange(next: boolean) {
    if (!next) handleCancel()
  }

  function handleCancel() {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedArea(null)
    setProcessing(false)
    onCancel()
  }

  async function handleConfirm() {
    if (!imageSrc || !croppedArea) return
    setProcessing(true)
    try {
      const blob = await getCroppedBlob(imageSrc, croppedArea)
      onConfirm(blob)
    } catch {
      toast.error(errors.cropFailed)
    } finally {
      setProcessing(false)
    }
  }

  if (!imageSrc) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-4">
        <DialogHeader>
          <DialogTitle>{copy.cropTitle}</DialogTitle>
          <DialogDescription>{copy.cropDescription}</DialogDescription>
        </DialogHeader>

        <div className="relative h-64 w-full overflow-hidden rounded-lg bg-muted">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, areaPixels) => setCroppedArea(areaPixels)}
          />
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="avatar-crop-zoom" className="text-sm text-muted-foreground">
            {copy.cropZoomLabel}
          </label>
          <input
            id="avatar-crop-zoom"
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel} disabled={processing}>
            {copy.cropCancel}
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={processing || !croppedArea}>
            {processing ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {copy.cropProcessing}
              </>
            ) : (
              copy.cropConfirm
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
