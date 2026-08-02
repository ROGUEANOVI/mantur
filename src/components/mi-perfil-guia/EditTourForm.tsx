'use client'

import { useActionState } from 'react'
import { updateGuideTour } from '@/app/(app)/mi-perfil-guia/actions'
import { guidesCopy } from '@/lib/copy/guides'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type FormState = { error: string | null; saved: boolean }

type Props = {
  tourId: string
  defaultValues: {
    name: string
    description: string | null
    price: number | string
    capacity: number
    duration_minutes: number | null
  }
}

const copy = guidesCopy.tourForm

export default function EditTourForm({ tourId, defaultValues }: Props) {
  async function updateAction(_prev: FormState, formData: FormData): Promise<FormState> {
    const result = await updateGuideTour(tourId, formData)
    if (result && 'error' in result) return { error: result.error, saved: false }
    return { error: null, saved: true }
  }

  const [state, formAction, pending] = useActionState<FormState, FormData>(updateAction, {
    error: null,
    saved: false,
  })

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="tour-name" className="text-sm font-medium">{copy.name}</Label>
        <Input
          id="tour-name"
          type="text"
          name="name"
          required
          defaultValue={defaultValues.name}
          placeholder={copy.namePlaceholder}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tour-description" className="text-sm font-medium">{copy.description}</Label>
        <textarea
          id="tour-description"
          name="description"
          rows={3}
          defaultValue={defaultValues.description ?? ''}
          placeholder={copy.descriptionPlaceholder}
          className={cn(
            'w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-base shadow-xs',
            'placeholder:text-muted-foreground transition-[color,box-shadow] outline-none resize-none',
            'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
            'disabled:pointer-events-none disabled:opacity-50',
            'md:text-sm dark:bg-input/30',
          )}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tour-price" className="text-sm font-medium">{copy.price}</Label>
        <Input
          id="tour-price"
          type="number"
          name="price"
          required
          min={0}
          step={500}
          defaultValue={Number(defaultValues.price)}
          placeholder={copy.pricePlaceholder}
          inputMode="numeric"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="tour-capacity" className="text-sm font-medium">{copy.capacity}</Label>
          <Input
            id="tour-capacity"
            type="number"
            name="capacity"
            min={1}
            defaultValue={defaultValues.capacity}
            placeholder={copy.capacityPlaceholder}
            inputMode="numeric"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tour-duration" className="text-sm font-medium">{copy.duration}</Label>
          <Input
            id="tour-duration"
            type="number"
            name="duration_minutes"
            min={1}
            defaultValue={defaultValues.duration_minutes ?? ''}
            placeholder={copy.durationPlaceholder}
            inputMode="numeric"
          />
        </div>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">{state.error}</p>
      )}

      {state.saved && !state.error && (
        <p role="status" className="text-sm text-primary font-medium">{copy.saved}</p>
      )}

      <Button type="submit" className="w-full rounded-xl min-h-11" disabled={pending}>
        {pending ? copy.saving : copy.save}
      </Button>
    </form>
  )
}
