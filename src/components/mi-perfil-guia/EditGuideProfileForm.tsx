'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { updateGuideProfile } from '@/app/(app)/mi-perfil-guia/actions'
import { guidesCopy } from '@/lib/copy/guides'
import { roleRequestsCopy } from '@/lib/copy/roleRequests'

type FormState = { error: string | null; saved: boolean }

type Props = {
  phone: string
  bio: string | null
  specialties: string[]
  languages: string[]
}

const copy = guidesCopy.editProfile
const specialtyOptions = roleRequestsCopy.form.touristGuide.specialtyOptions
const languageOptions = roleRequestsCopy.form.touristGuide.languageOptions

export default function EditGuideProfileForm({ phone, bio, specialties, languages }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const result = await updateGuideProfile(formData)
      if (result && 'error' in result) return { error: result.error, saved: false }
      return { error: null, saved: true }
    },
    { error: null, saved: false },
  )

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

      {state.error && (
        <p role="alert" className="text-sm text-destructive">{state.error}</p>
      )}
      {state.saved && (
        <p className="text-sm text-primary font-medium">{copy.saved}</p>
      )}

      <div className="flex gap-3 pt-1">
        <Link
          href="/mi-perfil-guia"
          className="inline-flex items-center gap-1.5 flex-1 justify-center rounded-xl border border-border text-sm font-medium min-h-[44px] hover:bg-muted transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {copy.back}
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-[44px] hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {pending ? copy.saving : copy.save}
        </button>
      </div>
    </form>
  )
}
