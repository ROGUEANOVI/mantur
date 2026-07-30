'use client'

import { useTransition, useRef, useState } from 'react'
import { Trash2, Upload, Loader2 } from 'lucide-react'
import imageCompression from 'browser-image-compression'
import { cn } from '@/lib/utils'

type ActionResult = { error: string } | void

type Props = {
  images: string[]
  maxImages?: number
  uploadAction: (formData: FormData) => Promise<ActionResult>
  deleteAction: (imageUrl: string) => Promise<ActionResult>
}

export default function ImageManager({
  images,
  maxImages = 5,
  uploadAction,
  deleteAction,
}: Props) {
  const [error, setError] = useState<string | null>(null)
  const [compressing, setCompressing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const busy = compressing || isPending

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setCompressing(true)
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: 'image/webp',
      })
      const webpFile = new File([compressed], `upload-${Date.now()}.webp`, {
        type: 'image/webp',
      })
      startTransition(async () => {
        const formData = new FormData()
        formData.append('image', webpFile)
        const result = await uploadAction(formData)
        if (result && 'error' in result) setError(result.error)
      })
    } catch {
      setError('Error al procesar la imagen. Intenta de nuevo.')
    } finally {
      setCompressing(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function handleDelete(url: string) {
    setError(null)
    startTransition(async () => {
      const result = await deleteAction(url)
      if (result && 'error' in result) setError(result.error)
    })
  }

  const canUpload = images.length < maxImages

  return (
    <div className="space-y-3">
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((url, i) => (
            <div key={url} className="relative aspect-square rounded-xl overflow-hidden group">
              {i === 0 && (
                <span className="absolute top-1.5 left-1.5 z-10 text-[10px] font-semibold bg-black/60 text-white px-1.5 py-0.5 rounded-full leading-none">
                  Portada
                </span>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => handleDelete(url)}
                disabled={busy}
                aria-label="Eliminar imagen"
                className={cn(
                  'absolute inset-0 flex items-center justify-center',
                  'bg-black/0 group-hover:bg-black/50 transition-colors',
                  'opacity-0 group-hover:opacity-100',
                )}
              >
                <Trash2 className="size-5 text-white drop-shadow" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      {canUpload && (
        <label
          className={cn(
            'flex items-center gap-2.5 rounded-xl border border-dashed border-border',
            'px-4 min-h-[52px] cursor-pointer hover:bg-muted/50 transition-colors',
            busy && 'pointer-events-none opacity-60',
          )}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelect}
            className="sr-only"
            disabled={busy}
          />
          {busy ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
          ) : (
            <Upload className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="text-sm text-muted-foreground">
            {busy
              ? 'Procesando...'
              : `Agregar foto ${images.length}/${maxImages}`}
          </span>
        </label>
      )}

      {!canUpload && (
        <p className="text-xs text-muted-foreground">
          Límite alcanzado ({maxImages} fotos). Elimina una para agregar otra.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
