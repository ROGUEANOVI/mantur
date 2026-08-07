'use client'

import { useTransition } from 'react'
import { toggleExperienceStatus } from '@/app/(app)/mi-negocio/actions'
import { miNegocioCopy } from '@/lib/copy/businesses'
import { Button } from '@/components/ui/button'

type Props = {
  experienceId: string
  currentStatus: 'active' | 'inactive'
}

const copy = miNegocioCopy.experiences

export function ToggleExperienceButton({ experienceId, currentStatus }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleToggle() {
    startTransition(async () => {
      await toggleExperienceStatus(experienceId, currentStatus)
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
      aria-label={`${label} experiencia`}
      className="min-h-11 min-w-[44px] rounded-xl"
    >
      {isPending ? copy.toggling : label}
    </Button>
  )
}
