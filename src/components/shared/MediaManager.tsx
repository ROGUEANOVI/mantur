'use client'

import { useTransition, useRef, useState } from 'react'
import { Trash2, Upload, Loader2, Play } from 'lucide-react'
import imageCompression from 'browser-image-compression'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import ConfirmDeleteButton from '@/components/shared/ConfirmDeleteButton'
import { cn } from '@/lib/utils'

type ActionResult = { error: string } | void
type SignedUploadResult = { token: string; path: string; publicUrl: string } | { error: string }

type MediaItem = { url: string; type: 'image' | 'video' }

type Props = {
  images: string[]
  videos: string[]
  maxMedia?: number
  videoBucket: string
  uploadImageAction: (formData: FormData) => Promise<ActionResult>
  deleteImageAction: (imageUrl: string) => Promise<ActionResult>
  requestVideoUploadAction: (
    fileName: string,
    fileType: string,
    fileSize: number,
  ) => Promise<SignedUploadResult>
  confirmVideoUploadAction: (path: string) => Promise<ActionResult>
  deleteVideoAction: (videoUrl: string) => Promise<ActionResult>
}

const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const MAX_VIDEO_BYTES = 50 * 1024 * 1024

export default function MediaManager({
  images,
  videos,
  maxMedia = 10,
  videoBucket,
  uploadImageAction,
  deleteImageAction,
  requestVideoUploadAction,
  confirmVideoUploadAction,
  deleteVideoAction,
}: Props) {
  const [compressing, setCompressing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const busy = compressing || isPending

  const media: MediaItem[] = [
    ...images.map((url) => ({ url, type: 'image' as const })),
    ...videos.map((url) => ({ url, type: 'video' as const })),
  ]

  async function handleImageSelect(file: File) {
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
        const result = await uploadImageAction(formData)
        if (result && 'error' in result) toast.error(result.error)
      })
    } catch {
      toast.error('Error al procesar la imagen. Intenta de nuevo.')
    } finally {
      setCompressing(false)
    }
  }

  function handleVideoSelect(file: File) {
    if (!VIDEO_MIME_TYPES.includes(file.type)) {
      toast.error('Formato no válido. Usa MP4, WebM o QuickTime.')
      return
    }
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error('El video no puede superar 50 MB.')
      return
    }

    startTransition(async () => {
      const requested = await requestVideoUploadAction(file.name, file.type, file.size)
      if ('error' in requested) {
        toast.error(requested.error)
        return
      }

      const supabase = createClient()
      const { error: uploadError } = await supabase.storage
        .from(videoBucket)
        .uploadToSignedUrl(requested.path, requested.token, file)

      if (uploadError) {
        toast.error('No se pudo subir el video. Intenta de nuevo.')
        return
      }

      const confirmed = await confirmVideoUploadAction(requested.path)
      if (confirmed && 'error' in confirmed) toast.error(confirmed.error)
    })
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type.startsWith('video/')) {
      handleVideoSelect(file)
    } else {
      await handleImageSelect(file)
    }

    if (fileRef.current) fileRef.current.value = ''
  }

  function handleDelete(item: MediaItem) {
    startTransition(async () => {
      const result =
        item.type === 'image' ? await deleteImageAction(item.url) : await deleteVideoAction(item.url)
      if (result && 'error' in result) toast.error(result.error)
    })
  }

  const canUpload = media.length < maxMedia

  return (
    <div className="space-y-3">
      {media.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {media.map((item, i) => (
            <div key={item.url} className="relative aspect-square rounded-xl overflow-hidden group bg-black">
              {i === 0 && (
                <span className="absolute top-1.5 left-1.5 z-10 text-[10px] font-semibold bg-black/60 text-white px-1.5 py-0.5 rounded-full leading-none">
                  Portada
                </span>
              )}
              {item.type === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt="" className="w-full h-full object-cover" />
              ) : (
                <>
                  <video
                    src={item.url}
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-1.5 right-1.5 z-10 flex items-center justify-center size-5 rounded-full bg-black/60">
                    <Play className="size-2.5 text-white fill-white" aria-hidden="true" />
                  </span>
                </>
              )}
              <ConfirmDeleteButton
                title={item.type === 'image' ? 'Eliminar imagen' : 'Eliminar video'}
                description="Esta acción no se puede deshacer."
                confirmLabel="Sí, eliminar"
                disabled={busy}
                triggerAriaLabel={item.type === 'image' ? 'Eliminar imagen' : 'Eliminar video'}
                triggerClassName={cn(
                  'absolute inset-0 flex items-center justify-center',
                  'bg-black/0 group-hover:bg-black/50 transition-colors',
                  'opacity-0 group-hover:opacity-100',
                )}
                trigger={<Trash2 className="size-5 text-white drop-shadow" aria-hidden="true" />}
                onConfirm={() => handleDelete(item)}
              />
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
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
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
              : `Agregar foto o video ${media.length}/${maxMedia}`}
          </span>
        </label>
      )}

      {!canUpload && (
        <p className="text-xs text-muted-foreground">
          Límite alcanzado ({maxMedia} fotos y videos). Elimina uno para agregar otro.
        </p>
      )}
    </div>
  )
}
