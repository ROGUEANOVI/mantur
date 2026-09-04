'use client'

import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { updateService } from '@/app/(app)/mi-negocio/actions'
import { miNegocioCopy } from '@/lib/copy/businesses'
import { getAttributeFields, PRICING_UNIT_LABELS, type PricingUnit } from '@/lib/services/attributeConfig'
import { cn } from '@/lib/utils'
import { DESCRIPTION_MAX_LENGTH } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import TextareaWithCounter from '@/components/shared/TextareaWithCounter'

type FormState = { error: string | null; saved: boolean }

type Props = {
  serviceId: string
  serviceTypeName: string
  serviceTypeSlug: string
  pricingUnit: PricingUnit
  defaultValues: {
    name: string
    description: string | null
    base_price: number | string
    capacity: number | null
    attributes: Record<string, unknown>
  }
}

const copy = miNegocioCopy

export default function EditServiceForm({
  serviceId,
  serviceTypeName,
  serviceTypeSlug,
  pricingUnit,
  defaultValues,
}: Props) {
  async function updateAction(_prev: FormState, formData: FormData): Promise<FormState> {
    const result = await updateService(serviceId, formData)
    if (result && 'error' in result) return { error: result.error, saved: false }
    return { error: null, saved: true }
  }

  const [state, formAction, pending] = useActionState<FormState, FormData>(updateAction, {
    error: null,
    saved: false,
  })

  useEffect(() => {
    if (state.error) toast.error(state.error)
    else if (state.saved) toast.success(copy.services.saved)
  }, [state])

  const attributeFields = getAttributeFields(serviceTypeSlug)

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {/* Service type — shown read-only, locked after creation */}
      <div className="space-y-1.5">
        <p className="text-sm font-medium leading-none">{copy.services.typeLabel}</p>
        <p className="text-sm text-muted-foreground">{serviceTypeName}</p>
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="svc-name" className="text-sm font-medium">
          {copy.form.name}
        </Label>
        <Input
          id="svc-name"
          type="text"
          name="name"
          required
          defaultValue={defaultValues.name}
          placeholder={copy.form.namePlaceholder}
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="svc-description" className="text-sm font-medium">
          {copy.form.description}
        </Label>
        <TextareaWithCounter
          id="svc-description"
          name="description"
          rows={3}
          defaultValue={defaultValues.description ?? ''}
          placeholder={copy.form.descriptionPlaceholder}
          maxLength={DESCRIPTION_MAX_LENGTH}
          textareaClassName={cn(
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
        <Label htmlFor="svc-price" className="text-sm font-medium">
          {PRICING_UNIT_LABELS[pricingUnit]}
        </Label>
        <Input
          id="svc-price"
          type="number"
          name="base_price"
          required
          min={0}
          step={500}
          defaultValue={Number(defaultValues.base_price)}
          placeholder={copy.form.pricePlaceholder}
          inputMode="numeric"
        />
      </div>

      {/* Capacity */}
      <div className="space-y-1.5">
        <Label htmlFor="svc-capacity" className="text-sm font-medium">
          {copy.form.capacity}
        </Label>
        <Input
          id="svc-capacity"
          type="number"
          name="capacity"
          min={1}
          defaultValue={defaultValues.capacity ?? ''}
          placeholder={copy.form.capacityPlaceholder}
          inputMode="numeric"
        />
      </div>

      {/* Type-specific attribute fields */}
      {attributeFields.length > 0 && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {attributeFields.map((field) => {
            const currentValue = defaultValues.attributes?.[field.key]
            return (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`attr-${field.key}`} className="text-sm font-medium">
                  {field.label}
                </Label>
                {field.kind === 'select' ? (
                  <select
                    id={`attr-${field.key}`}
                    name={`attr_${field.key}`}
                    required={field.required}
                    defaultValue={typeof currentValue === 'string' ? currentValue : ''}
                    className={cn(
                      'w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-base shadow-xs',
                      'outline-none transition-[color,box-shadow]',
                      'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
                      'md:text-sm dark:bg-input/30',
                    )}
                  >
                    <option value="" disabled>
                      —
                    </option>
                    {field.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={`attr-${field.key}`}
                    type={field.kind === 'number' ? 'number' : 'text'}
                    name={`attr_${field.key}`}
                    min={field.kind === 'number' ? field.min : undefined}
                    required={field.required}
                    defaultValue={
                      typeof currentValue === 'string' || typeof currentValue === 'number'
                        ? currentValue
                        : ''
                    }
                    placeholder={field.placeholder}
                    inputMode={field.kind === 'number' ? 'numeric' : undefined}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      <Button
        type="submit"
        className="w-full rounded-xl min-h-11"
        disabled={pending}
      >
        {pending ? copy.form.saving : copy.form.save}
      </Button>
    </form>
  )
}
