'use client'

import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { toggleAvailability } from '@/app/(app)/mi-perfil-transporte/actions'
import { cn } from '@/lib/utils'

type State = { error: string } | void

export default function AvailabilityToggle({
  isAvailable,
}: {
  isAvailable: boolean
}) {
  const [state, formAction, isPending] = useActionState<State, FormData>(
    toggleAvailability,
    undefined,
  )

  useEffect(() => {
    if (state && 'error' in state) toast.error(state.error)
  }, [state])

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={isPending}
        aria-label={
          isAvailable ? 'Marcar como no disponible' : 'Marcar como disponible'
        }
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          isAvailable ? 'bg-primary' : 'bg-muted-foreground/30',
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block size-4 rounded-full bg-white shadow translate-y-1 transition-transform duration-200 ease-in-out',
            isAvailable ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
    </form>
  )
}
