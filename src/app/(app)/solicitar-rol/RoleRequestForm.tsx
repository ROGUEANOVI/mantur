'use client'

import { useActionState, useState } from 'react'
import { Store, Car, Compass, ChevronRight, ArrowLeft } from 'lucide-react'
import { roleRequestsCopy } from '@/lib/copy/roleRequests'
import { submitRoleRequest } from './actions'
import { cn } from '@/lib/utils'
import { normalizeColombianPhone } from '@/lib/phone'

type RequestableRole = 'business_owner' | 'transporter' | 'tourist_guide'
type ActionResult = { error?: string; success?: boolean }
type Category = { slug: string; name: string }

const copy = roleRequestsCopy

const ROLE_CARDS: {
  value: RequestableRole
  Icon: React.ElementType
  color: string
  bg: string
}[] = [
  { value: 'business_owner', Icon: Store,   color: 'text-primary',    bg: 'bg-primary/10' },
  { value: 'transporter',    Icon: Car,     color: 'text-accent',     bg: 'bg-accent/10'  },
  { value: 'tourist_guide',  Icon: Compass, color: 'text-primary',    bg: 'bg-primary/10' },
]

export default function RoleRequestForm({ categories }: { categories: Category[] }) {
  const [selected, setSelected] = useState<RequestableRole | null>(null)
  const [phoneError, setPhoneError] = useState<string | null>(null)

  function selectRole(role: RequestableRole | null) {
    setPhoneError(null)
    setSelected(role)
  }

  function handlePhoneBlur(e: React.FocusEvent<HTMLInputElement>) {
    const raw = e.target.value.trim()
    setPhoneError(raw && !normalizeColombianPhone(raw) ? copy.errors.invalidPhone : null)
  }

  const [state, action, pending] = useActionState<ActionResult, FormData>(
    async (_prev, formData) => {
      const rawPhone = (formData.get('phone') as string | null)?.trim() || ''
      if (rawPhone && !normalizeColombianPhone(rawPhone)) {
        setPhoneError(copy.errors.invalidPhone)
        return {}
      }
      return submitRoleRequest(formData)
    },
    {},
  )

  if (state.success) {
    return (
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center space-y-2">
        <p className="text-lg font-semibold text-foreground">{copy.status.pending.title}</p>
        <p className="text-sm text-muted-foreground">{copy.status.pending.description}</p>
      </div>
    )
  }

  // Step 1 — Role selection cards
  if (!selected) {
    return (
      <div className="space-y-3">
        {ROLE_CARDS.map(({ value, Icon, color, bg }) => {
          const card = copy.roleCards[value]
          return (
            <button
              key={value}
              type="button"
              onClick={() => selectRole(value)}
              className="w-full flex items-start gap-4 rounded-2xl border border-border bg-card shadow-sm p-5 text-left hover:border-primary/50 hover:shadow-md transition-all group"
            >
              <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', bg)}>
                <Icon className={cn('size-5', color)} strokeWidth={1.5} aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm">{card.hook}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{card.value}</p>
                <p className={cn('text-xs font-medium mt-2', color)}>{card.cta}</p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground shrink-0 mt-1 group-hover:text-foreground transition-colors" aria-hidden="true" />
            </button>
          )
        })}
      </div>
    )
  }

  // Step 2 — Role-specific form
  const card = copy.roleCards[selected]
  const roleCard = ROLE_CARDS.find((r) => r.value === selected)!

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="requested_role" value={selected} />

      {/* Header with selected role */}
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', roleCard.bg)}>
          <roleCard.Icon className={cn('size-5', roleCard.color)} strokeWidth={1.5} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{copy.roles[selected]}</p>
          <p className="text-xs text-muted-foreground">{card.hook}</p>
        </div>
        <button
          type="button"
          onClick={() => selectRole(null)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          {copy.form.back}
        </button>
      </div>

      {/* Role-specific fields */}
      {selected === 'business_owner' && (
        <fieldset className="space-y-3">
          <Field label={copy.form.businessOwner.businessName} name="business_name" placeholder={copy.form.businessOwner.businessNamePlaceholder} />
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">{copy.form.businessOwner.categories}</p>
            <p className="text-xs text-muted-foreground">{copy.form.businessOwner.categoriesHint}</p>
            <div className="grid grid-cols-2 gap-2">
              {categories.map((c) => (
                <label
                  key={c.slug}
                  className="flex items-center gap-2.5 rounded-xl border border-border bg-background px-3 py-2.5 cursor-pointer text-sm text-foreground transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary"
                >
                  <input type="checkbox" name="category_slugs" value={c.slug} className="accent-primary" />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
          <Field label={copy.form.businessOwner.phone} name="phone" placeholder={copy.form.businessOwner.phonePlaceholder} type="tel" onBlur={handlePhoneBlur} error={phoneError} />
        </fieldset>
      )}

      {selected === 'transporter' && (
        <fieldset className="space-y-3">
          <Field label={copy.form.transporter.licensePlate} name="license_plate" placeholder={copy.form.transporter.licensePlatePlaceholder} />
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{copy.form.transporter.vehicleType}</label>
            <select
              name="vehicle_type"
              required
              className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
            >
              <option value="">Selecciona un tipo</option>
              {Object.entries(copy.form.transporter.vehicleTypes).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>
          <Field label={copy.form.transporter.phone} name="phone" placeholder={copy.form.transporter.phonePlaceholder} type="tel" onBlur={handlePhoneBlur} error={phoneError} />
        </fieldset>
      )}

      {selected === 'tourist_guide' && (
        <fieldset className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">{copy.form.touristGuide.specialties}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(copy.form.touristGuide.specialtyOptions).map(([v, label]) => (
                <label key={v} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="checkbox" name="specialties" value={v} className="accent-primary" />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">{copy.form.touristGuide.languages}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {Object.entries(copy.form.touristGuide.languageOptions).map(([v, label]) => (
                <label key={v} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="checkbox" name="languages" value={v} className="accent-primary" />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <Field label={copy.form.touristGuide.phone} name="phone" placeholder={copy.form.touristGuide.phonePlaceholder} type="tel" onBlur={handlePhoneBlur} error={phoneError} />

          <Field label={copy.form.touristGuide.experienceYears} name="experience_years" placeholder={copy.form.touristGuide.experienceYearsPlaceholder} type="number" min={0} max={60} />

          <div className="space-y-1.5">
            <label htmlFor="bio" className="text-sm font-medium text-foreground">{copy.form.touristGuide.bio}</label>
            <textarea
              id="bio"
              name="bio"
              required
              rows={3}
              placeholder={copy.form.touristGuide.bioPlaceholder}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none"
            />
          </div>
        </fieldset>
      )}

      {/* Notes — all roles */}
      <div className="space-y-1.5">
        <label htmlFor="notes" className="text-sm font-medium text-foreground">{copy.form.notesLabel}</label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          placeholder={copy.form.notesPlaceholder}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none"
        />
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-11 hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {pending ? copy.form.submitting : copy.form.submit}
      </button>
    </form>
  )
}

function Field({ label, name, placeholder, type = 'text', min, max, onBlur, error }: {
  label: string; name: string; placeholder?: string; type?: string; min?: number; max?: number
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void; error?: string | null
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-sm font-medium text-foreground">{label}</label>
      <input
        id={name}
        type={type}
        name={name}
        placeholder={placeholder}
        required
        min={min}
        max={max}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 aria-invalid:border-destructive"
      />
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
