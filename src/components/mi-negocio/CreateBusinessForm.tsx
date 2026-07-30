'use client'

import { useActionState, useState } from 'react'
import { Waves, Utensils, TreePine, Coffee, Store } from 'lucide-react'

import { createBusiness } from '@/app/(app)/mi-negocio/actions'
import { miNegocioCopy, businessesCopy } from '@/lib/copy/businesses'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type BusinessType = 'resort' | 'restaurant' | 'farm' | 'eatery' | 'other'
type FormState = { error: string | null }

async function createBusinessAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  // createBusiness redirects on success, returns { error } on failure
  const result = await createBusiness(formData)
  return result ?? { error: null }
}

const TYPE_OPTIONS: { value: BusinessType; Icon: React.ElementType }[] = [
  { value: 'resort', Icon: Waves },
  { value: 'restaurant', Icon: Utensils },
  { value: 'farm', Icon: TreePine },
  { value: 'eatery', Icon: Coffee },
  { value: 'other', Icon: Store },
]

const copy = miNegocioCopy

export default function CreateBusinessForm() {
  const [selectedType, setSelectedType] = useState<BusinessType>('resort')

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createBusinessAction,
    { error: null },
  )

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="biz-name" className="text-sm font-medium">
          {copy.form.name}
        </Label>
        <Input
          id="biz-name"
          type="text"
          name="name"
          required
          placeholder={copy.form.businessNamePlaceholder}
        />
      </div>

      {/* Business type selector */}
      <div className="space-y-2">
        <p className="text-sm font-medium leading-none select-none">
          {copy.form.type}
        </p>

        {/*
         * 3-column grid on all sizes: 5 cards → 2 rows (3 + 2).
         * Each card is tall enough for a 44px touch target.
         */}
        <div className="grid grid-cols-3 gap-2">
          {TYPE_OPTIONS.map(({ value, Icon }) => {
            const isSelected = selectedType === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setSelectedType(value)}
                aria-pressed={isSelected}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors min-h-[72px]',
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-background hover:bg-muted',
                )}
              >
                <Icon
                  className={cn(
                    'size-5 shrink-0',
                    isSelected ? 'text-primary' : 'text-muted-foreground',
                  )}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    'text-xs font-medium leading-tight',
                    isSelected ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {businessesCopy.businesses.types[value]}
                </span>
              </button>
            )
          })}
        </div>

        {/* Hidden input carries the selected type to the Server Action */}
        <input type="hidden" name="type" value={selectedType} />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="biz-description" className="text-sm font-medium">
          {copy.form.description}
        </Label>
        <textarea
          id="biz-description"
          name="description"
          rows={3}
          placeholder={copy.form.businessDescriptionPlaceholder}
          className={cn(
            'w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-base shadow-xs',
            'placeholder:text-muted-foreground transition-[color,box-shadow] outline-none resize-none',
            'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
            'disabled:pointer-events-none disabled:opacity-50',
            'md:text-sm dark:bg-input/30',
          )}
        />
      </div>

      {/* Address */}
      <div className="space-y-1.5">
        <Label htmlFor="biz-address" className="text-sm font-medium">
          {copy.form.address}
        </Label>
        <Input
          id="biz-address"
          type="text"
          name="address"
          placeholder={copy.form.addressPlaceholder}
        />
      </div>

      {/* Phone */}
      <div className="space-y-1.5">
        <Label htmlFor="biz-phone" className="text-sm font-medium">
          {copy.form.phone}
        </Label>
        <Input
          id="biz-phone"
          type="tel"
          name="phone"
          autoComplete="tel"
          placeholder={copy.form.phonePlaceholder}
        />
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
        className="w-full rounded-xl min-h-[44px]"
        disabled={pending}
      >
        {pending ? copy.setup.submitting : copy.setup.submit}
      </Button>
    </form>
  )
}
