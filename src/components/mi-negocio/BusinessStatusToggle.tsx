'use client'

import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { toggleBusinessStatus } from '@/app/(app)/mi-negocio/actions'
import { cn } from '@/lib/utils'

type State = { error: string } | void

export default function BusinessStatusToggle({
  businessId,
  status,
}: {
  businessId: string
  status: string
}) {
  const isActive = status === 'active'

  async function action(_prev: State, _formData: FormData): Promise<State> {
    return toggleBusinessStatus(businessId, status)
  }

  const [state, formAction, isPending] = useActionState<State, FormData>(action, undefined)

  useEffect(() => {
    if (state && 'error' in state) toast.error(state.error)
  }, [state])

  return (
    <form
      action={formAction}
      className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card shadow-sm p-5"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          {isActive ? 'Visible en Explorar' : 'Oculto de Explorar'}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isActive
            ? 'Los turistas pueden ver y reservar tu negocio.'
            : 'Tu negocio no aparece en la búsqueda pública.'}
        </p>
      </div>
      <button
        type="submit"
        disabled={isPending}
        aria-label={isActive ? 'Ocultar negocio de Explorar' : 'Mostrar negocio en Explorar'}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          isActive ? 'bg-primary' : 'bg-muted-foreground/30',
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block size-4 rounded-full bg-white shadow translate-y-1 transition-transform duration-200 ease-in-out',
            isActive ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
    </form>
  )
}
