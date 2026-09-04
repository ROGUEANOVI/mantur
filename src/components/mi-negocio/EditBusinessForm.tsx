'use client'

import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { updateBusiness } from '@/app/(app)/mi-negocio/actions'
import { miNegocioCopy } from '@/lib/copy/businesses'
import { cn } from '@/lib/utils'
import { normalizeColombianPhone } from '@/lib/phone'
import { DESCRIPTION_MAX_LENGTH } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import LocationPicker from '@/components/shared/LocationPicker'
import TextareaWithCounter from '@/components/shared/TextareaWithCounter'
import ComplianceDocumentField from '@/components/shared/ComplianceDocumentField'

const INVALID_PHONE = 'Escribe un número de celular colombiano válido (10 dígitos, ej: 300 123 4567).'

type FormState = { error: string | null }
type Category = { id: string; name: string }

type Props = {
  businessId: string
  defaultValues: {
    name: string
    description: string | null
    address: string | null
    phone: string | null
    lat: number | null
    lng: number | null
    rntNumber: string | null
    rntStatus: string
  }
  categories: Category[]
  selectedCategoryIds: string[]
}

export default function EditBusinessForm({
  businessId,
  defaultValues,
  categories,
  selectedCategoryIds,
}: Props) {
  const [phoneError, setPhoneError] = useState<string | null>(null)

  function handlePhoneBlur(e: React.FocusEvent<HTMLInputElement>) {
    const raw = e.target.value.trim()
    setPhoneError(raw && !normalizeColombianPhone(raw) ? INVALID_PHONE : null)
  }

  const boundAction = updateBusiness.bind(null, businessId)

  async function editAction(_prev: FormState, formData: FormData): Promise<FormState> {
    const rawPhone = (formData.get('phone') as string | null)?.trim() || ''
    if (rawPhone && !normalizeColombianPhone(rawPhone)) {
      setPhoneError(INVALID_PHONE)
      return { error: null }
    }
    const result = await boundAction(formData)
    return result ?? { error: null }
  }

  const [state, formAction, pending] = useActionState<FormState, FormData>(editAction, {
    error: null,
  })

  useEffect(() => {
    if (state.error) toast.error(state.error)
  }, [state])

  const copy = miNegocioCopy

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
          defaultValue={defaultValues.name}
          placeholder={copy.form.businessNamePlaceholder}
        />
      </div>

      {/* Categories — multi-select checkboxes */}
      <div className="space-y-2">
        <p className="text-sm font-medium leading-none select-none">{copy.form.categories}</p>
        <p className="text-xs text-muted-foreground">{copy.form.categoriesHint}</p>
        <div className="grid grid-cols-2 gap-2">
          {categories.map((cat) => (
            <label
              key={cat.id}
              className={cn(
                'flex items-center gap-2.5 rounded-xl border border-border bg-background px-3 py-2.5',
                'cursor-pointer text-sm text-foreground transition-colors',
                'has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary',
              )}
            >
              <input
                type="checkbox"
                name="category_ids"
                value={cat.id}
                defaultChecked={selectedCategoryIds.includes(cat.id)}
                className="accent-primary"
              />
              {cat.name}
            </label>
          ))}
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="biz-description" className="text-sm font-medium">
          {copy.form.description}
        </Label>
        <TextareaWithCounter
          id="biz-description"
          name="description"
          rows={3}
          defaultValue={defaultValues.description ?? ''}
          placeholder={copy.form.businessDescriptionPlaceholder}
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

      {/* Address */}
      <div className="space-y-1.5">
        <Label htmlFor="biz-address" className="text-sm font-medium">
          {copy.form.address}
        </Label>
        <Input
          id="biz-address"
          type="text"
          name="address"
          defaultValue={defaultValues.address ?? ''}
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
          defaultValue={defaultValues.phone ?? ''}
          onBlur={handlePhoneBlur}
          onChange={() => phoneError && setPhoneError(null)}
          aria-invalid={phoneError ? true : undefined}
          placeholder={copy.form.phonePlaceholder}
          className="aria-invalid:border-destructive"
        />
        {phoneError && (
          <p role="alert" className="text-sm text-destructive">{phoneError}</p>
        )}
      </div>

      {/* Location */}
      <LocationPicker
        defaultLat={defaultValues.lat}
        defaultLng={defaultValues.lng}
        label={copy.form.location}
        hint={copy.form.locationHint}
      />

      {/* RNT */}
      <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
        <div>
          <p className="text-sm font-medium text-foreground">{copy.form.rntSectionTitle}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {copy.form.rntCurrentStatus}:{' '}
            <span className="font-medium text-foreground">
              {copy.form.rntStatusLabels[defaultValues.rntStatus] ?? defaultValues.rntStatus}
            </span>
            {defaultValues.rntNumber && <> · RNT {defaultValues.rntNumber}</>}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="biz-rnt-number" className="text-sm font-medium">
            {copy.form.rntNumber}
          </Label>
          <Input
            id="biz-rnt-number"
            type="text"
            name="rnt_number"
            defaultValue={defaultValues.rntNumber ?? ''}
            placeholder={copy.form.rntNumberPlaceholder}
          />
        </div>
        <ComplianceDocumentField
          label={copy.form.rntDocument}
          name="rnt_document"
          hint={copy.form.rntUpdateHint}
          required={false}
        />
      </div>

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
