'use client'

import { useTransition } from 'react'
import { toggleServiceStatus } from '@/app/(app)/mi-negocio/actions'
import { miNegocioCopy } from '@/lib/copy/businesses'
import { Button } from '@/components/ui/button'

type Props = {
  serviceId: string
  currentStatus: 'active' | 'inactive'
}

const copy = miNegocioCopy.services

export function ToggleServiceButton({ serviceId, currentStatus }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleToggle() {
    startTransition(async () => {
      await toggleServiceStatus(serviceId, currentStatus)
    })
  }

  const label =
    currentStatus === 'active' ? copy.deactivate : copy.activate

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleToggle}
      disabled={isPending}
      aria-label={`${label} servicio`}
      className="min-h-11 min-w-[44px] rounded-xl"
    >
      {isPending ? copy.toggling : label}
    </Button>
  )
}
