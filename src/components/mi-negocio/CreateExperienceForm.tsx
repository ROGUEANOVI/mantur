'use client'

import { useActionState } from 'react'
import { createExperience } from '@/app/(app)/mi-negocio/actions'
import { miNegocioCopy } from '@/lib/copy/businesses'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type FormState = { error: string | null }

async function createExperienceAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  // createExperience redirects on success, returns { error } on failure
  const result = await createExperience(formData)
  return result ?? { error: null }
}

type Props = {
  businessId: string
}

const copy = miNegocioCopy

export default function CreateExperienceForm({ businessId }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createExperienceAction,
    { error: null },
  )

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {/* Hidden business_id — validated server-side against owner_id */}
      <input type="hidden" name="business_id" value={businessId} />

      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="exp-name" className="text-sm font-medium">
          {copy.form.name}
        </Label>
        <Input
          id="exp-name"
          type="text"
          name="name"
          required
          placeholder={copy.form.namePlaceholder}
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="exp-description" className="text-sm font-medium">
          {copy.form.description}
        </Label>
        <textarea
          id="exp-description"
          name="description"
          rows={3}
          placeholder={copy.form.descriptionPlaceholder}
          className={cn(
            'w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-base shadow-xs',
            'placeholder:text-muted-foreground transition-[color,box-shadow] outline-none resize-none',
            'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
            'disabled:pointer-events-none disabled:opacity-50',
            'md:text-sm dark:bg-input/30',
          )}
        />
      </div>

      {/* Price */}
      <div className="space-y-1.5">
        <Label htmlFor="exp-price" className="text-sm font-medium">
          {copy.form.price}
        </Label>
        <Input
          id="exp-price"
          type="number"
          name="price"
          required
          min={0}
          step={500}
          placeholder={copy.form.pricePlaceholder}
          inputMode="numeric"
        />
      </div>

      {/* Capacity + Duration side by side on sm+ */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="exp-capacity" className="text-sm font-medium">
            {copy.form.capacity}
          </Label>
          <Input
            id="exp-capacity"
            type="number"
            name="capacity"
            min={1}
            placeholder={copy.form.capacityPlaceholder}
            inputMode="numeric"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="exp-duration" className="text-sm font-medium">
            {copy.form.duration}
          </Label>
          <Input
            id="exp-duration"
            type="number"
            name="duration_minutes"
            min={1}
            placeholder={copy.form.durationPlaceholder}
            inputMode="numeric"
          />
        </div>
      </div>

      {/* Inline error */}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      {/* Submit */}
      <Button
        type="submit"
        className="w-full rounded-xl min-h-11"
        disabled={pending}
      >
        {pending ? copy.form.submitting : copy.form.submit}
      </Button>
    </form>
  )
}
