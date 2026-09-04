'use client'

import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createService } from '@/app/(app)/mi-negocio/actions'
import { miNegocioCopy } from '@/lib/copy/businesses'
import { getAttributeFields, PRICING_UNIT_LABELS } from '@/lib/services/attributeConfig'
import { cn } from '@/lib/utils'
import { DESCRIPTION_MAX_LENGTH } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import TextareaWithCounter from '@/components/shared/TextareaWithCounter'

type FormState = { error: string | null }

async function createServiceAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  // createService redirects on success, returns { error } on failure
  const result = await createService(formData)
  return result ?? { error: null }
}

type ServiceTypeOption = {
  id: string
  slug: string
  name: string
  pricing_unit: 'per_person' | 'per_night' | 'fixed'
}

type Props = {
  businessId: string
  serviceTypes: ServiceTypeOption[]
}

const copy = miNegocioCopy

export default function CreateServiceForm({ businessId, serviceTypes }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createServiceAction,
    { error: null },
  )
  const [selectedTypeId, setSelectedTypeId] = useState<string>('')

  useEffect(() => {
    if (state.error) toast.error(state.error)
  }, [state.error])

  const selectedType = serviceTypes.find((t) => t.id === selectedTypeId) ?? null
  const attributeFields = selectedType ? getAttributeFields(selectedType.slug) : []

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {/* Hidden business_id — validated server-side against owner_id */}
      <input type="hidden" name="business_id" value={businessId} />

      {/* Service type — locked once created, so pick it first */}
      <div className="space-y-2">
        <p className="text-sm font-medium leading-none select-none">{copy.services.typeLabel}</p>
        <p className="text-xs text-muted-foreground">{copy.services.typeHint}</p>
        <div className="grid grid-cols-2 gap-2">
          {serviceTypes.map((type) => (
            <label
              key={type.id}
              className={cn(
                'flex items-center gap-2.5 rounded-xl border border-border bg-background px-3 py-2.5',
                'cursor-pointer text-sm text-foreground transition-colors',
                'has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary',
              )}
            >
              <input
                type="radio"
                name="service_type_id"
                value={type.id}
                required
                checked={selectedTypeId === type.id}
                onChange={() => setSelectedTypeId(type.id)}
                className="accent-primary"
              />
              {type.name}
            </label>
          ))}
        </div>
      </div>

      {selectedType && (
        <>
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
              {PRICING_UNIT_LABELS[selectedType.pricing_unit]}
            </Label>
            <Input
              id="svc-price"
              type="number"
              name="base_price"
              required
              min={0}
              step={500}
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
              placeholder={copy.form.capacityPlaceholder}
              inputMode="numeric"
            />
          </div>

          {/* Type-specific attribute fields */}
          {attributeFields.length > 0 && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {attributeFields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={`attr-${field.key}`} className="text-sm font-medium">
                    {field.label}
                  </Label>
                  {field.kind === 'select' ? (
                    <select
                      id={`attr-${field.key}`}
                      name={`attr_${field.key}`}
                      required={field.required}
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
                      placeholder={field.placeholder}
                      inputMode={field.kind === 'number' ? 'numeric' : undefined}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Submit */}
      <Button
        type="submit"
        className="w-full rounded-xl min-h-11"
        disabled={pending || !selectedType}
      >
        {pending ? copy.form.submitting : copy.form.submit}
      </Button>
    </form>
  )
}
