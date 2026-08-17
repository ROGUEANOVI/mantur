'use client'

import { useTransition, useState, useEffect } from 'react'
import { Camera, Loader2, Upload, Trash2 } from 'lucide-react'
import imageCompression from 'browser-image-compression'
import { profileCopy } from '@/lib/copy/profile'

type ActionResult = { error: string } | void

type Props = {
  avatarUrl: string | null
  name: string
  uploadAction: (formData: FormData) => Promise<ActionResult>
  removeAction: () => Promise<ActionResult>
}

const copy = profileCopy.avatar
const errors = profileCopy.errors

export default function AvatarUploader({ avatarUrl, name, uploadAction, removeAction }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [compressing, setCompressing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [imgFailed, setImgFailed] = useState(false)
  const busy = compressing || isPending
  const initials = getInitials(name)
  const showImage = avatarUrl && !imgFailed

  // A previously-failed URL (e.g. blocked by an ad blocker, or a Google
  // photo URL that rotated) shouldn't stay stuck once avatarUrl changes —
  // most commonly right after a fresh upload replaces it.
  useEffect(() => {
    setImgFailed(false)
  }, [avatarUrl])

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target
    const file = input.files?.[0]
    if (!file) return
    setError(null)

    const valid = ['image/jpeg', 'image/png', 'image/webp']
    if (!valid.includes(file.type)) {
      setError(errors.invalidFormat)
      input.value = ''
      return
    }

    setCompressing(true)
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 512,
        useWebWorker: true,
        fileType: 'image/webp',
      })
      const webpFile = new File([compressed], `avatar-${Date.now()}.webp`, {
        type: 'image/webp',
      })
      startTransition(async () => {
        const formData = new FormData()
        formData.append('image', webpFile)
        const result = await uploadAction(formData)
        if (result && 'error' in result) setError(result.error)
      })
    } catch {
      setError(errors.compressionFailed)
    } finally {
      setCompressing(false)
      input.value = ''
    }
  }

  function handleRemove() {
    setError(null)
    startTransition(async () => {
      const result = await removeAction()
      if (result && 'error' in result) setError(result.error)
    })
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative size-28">
        <div className="size-28 rounded-full overflow-hidden bg-primary flex items-center justify-center select-none">
          {showImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={name}
              className="w-full h-full object-cover"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <span className="text-3xl font-semibold text-primary-foreground" aria-hidden="true">
              {initials || '?'}
            </span>
          )}
        </div>

        <label
          className="absolute bottom-0 right-0 flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm cursor-pointer hover:bg-accent/90 transition-colors"
          aria-label={copy.changePhotoAria}
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelect}
            className="sr-only"
            disabled={busy}
          />
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Camera className="size-4" aria-hidden="true" />
          )}
        </label>
      </div>

      <div className="flex items-center gap-3 text-sm font-medium">
        <label className="inline-flex items-center gap-1.5 text-primary hover:text-primary/80 cursor-pointer transition-colors">
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="size-3.5" aria-hidden="true" />
          )}
          {busy ? copy.uploading : copy.changePhoto}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelect}
            className="sr-only"
            disabled={busy}
          />
        </label>
        {avatarUrl && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-60"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            {copy.removePhoto}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive text-center">
          {error}
        </p>
      )}
    </div>
  )
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}
