'use client'

import { useActionState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { updateGuideProfile } from '@/app/(app)/mi-perfil-guia/actions'
import { guidesCopy } from '@/lib/copy/guides'
import { roleRequestsCopy } from '@/lib/copy/roleRequests'
import RawFileField from '@/components/shared/RawFileField'

type FormState = { error: string | null; saved: boolean }

type Props = {
  phone: string
  bio: string | null
  specialties: string[]
  languages: string[]
  rntNumber: string | null
  tarjetaProfesionalNumber: string | null
  verificationStatus: string
}

const copy = guidesCopy.editProfile
const guideFormCopy = roleRequestsCopy.form.touristGuide
const specialtyOptions = roleRequestsCopy.form.touristGuide.specialtyOptions
const languageOptions = roleRequestsCopy.form.touristGuide.languageOptions

export default function EditGuideProfileForm({
  phone, bio, specialties, languages, rntNumber, tarjetaProfesionalNumber, verificationStatus,
}: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const result = await updateGuideProfile(formData)
      if (result && 'error' in result) return { error: result.error, saved: false }
      return { error: null, saved: true }
    },
    { error: null, saved: false },
  )

  useEffect(() => {
    if (state.error) toast.error(state.error)
    else if (state.saved) toast.success(copy.saved)
  }, [state])

  return (
    <form action={action} className="space-y-5">
      {/* Phone */}
      <div className="space-y-1.5">
        <label htmlFor="phone" className="text-sm font-medium text-foreground">
          {copy.phone}
        </label>
        <input
          id="phone"
          type="tel"
          name="phone"
          required
          defaultValue={phone}
          placeholder={copy.phonePlaceholder}
          className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
        />
      </div>

      {/* Bio */}
      <div className="space-y-1.5">
        <label htmlFor="bio" className="text-sm font-medium text-foreground">
          {copy.bio}
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          defaultValue={bio ?? ''}
          placeholder={copy.bioPlaceholder}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none"
        />
      </div>

      {/* Specialties */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">{copy.specialties}</p>
        <div className="grid grid-cols-2 gap-1.5">
          {Object.entries(specialtyOptions).map(([v, label]) => (
            <label
              key={v}
              className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 cursor-pointer text-sm text-foreground transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary"
            >
              <input
                type="checkbox"
                name="specialties"
                value={v}
                defaultChecked={specialties.includes(v)}
                className="accent-primary"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Languages */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">{copy.languages}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {Object.entries(languageOptions).map(([v, label]) => (
            <label key={v} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                name="languages"
                value={v}
                defaultChecked={languages.includes(v)}
                className="accent-primary"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* RNT + Tarjeta Profesional */}
      <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
        <div>
          <p className="text-sm font-medium text-foreground">{copy.rntSectionTitle}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {copy.currentStatus}:{' '}
            <span className="font-medium text-foreground">
              {copy.statusLabels[verificationStatus] ?? verificationStatus}
            </span>
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="rnt_number" className="text-sm font-medium text-foreground">{guideFormCopy.rntNumber}</label>
          <input
            id="rnt_number"
            type="text"
            name="rnt_number"
            defaultValue={rntNumber ?? ''}
            placeholder={guideFormCopy.rntNumberPlaceholder}
            className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>
        <RawFileField label={guideFormCopy.rntDocument} name="rnt_document" hint={copy.updateHint} required={false} />

        <div className="space-y-1.5">
          <label htmlFor="tarjeta_profesional_number" className="text-sm font-medium text-foreground">{guideFormCopy.tarjetaProfesionalNumber}</label>
          <input
            id="tarjeta_profesional_number"
            type="text"
            name="tarjeta_profesional_number"
            defaultValue={tarjetaProfesionalNumber ?? ''}
            placeholder={guideFormCopy.tarjetaProfesionalNumberPlaceholder}
            className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>
        <RawFileField label={guideFormCopy.tarjetaProfesionalDocument} name="tarjeta_profesional_document" required={false} />
      </div>

      <div className="flex gap-3 pt-1">
        <Link
          href="/mi-perfil-guia"
          className="inline-flex items-center gap-1.5 flex-1 justify-center rounded-xl border border-border text-sm font-medium min-h-11 hover:bg-muted transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {copy.back}
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-11 hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {pending ? copy.saving : copy.save}
        </button>
      </div>
    </form>
  )
}
