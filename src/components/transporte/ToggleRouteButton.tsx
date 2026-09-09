'use client'

import { useTransition } from 'react'
import { toggleTransporterRouteStatus } from '@/app/(app)/mi-perfil-transporte/actions'
import { transportCopy } from '@/lib/copy/transport'
import { Button } from '@/components/ui/button'

type Props = {
  routeId: string
  currentStatus: 'active' | 'inactive'
}

const copy = transportCopy.routes

export default function ToggleRouteButton({ routeId, currentStatus }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleToggle() {
    startTransition(async () => {
      await toggleTransporterRouteStatus(routeId, currentStatus)
    })
  }

  const label = currentStatus === 'active' ? copy.deactivate : copy.activate

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleToggle}
      disabled={isPending}
      aria-label={`${label} ruta`}
      className="min-h-11 min-w-[44px] rounded-xl"
    >
      {isPending ? copy.toggling : label}
    </Button>
  )
}
