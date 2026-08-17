'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Lock } from 'lucide-react'
import { updateProfile, uploadAvatar, removeAvatar } from '@/app/(app)/mi-perfil/actions'
import { profileCopy } from '@/lib/copy/profile'
import { normalizeColombianPhone } from '@/lib/phone'
import { isValidFullName } from '@/lib/name'
import AvatarUploader from '@/components/shared/AvatarUploader'

type FormState = { error: string | null }

type Props = {
  fullName: string
  phone: string
  email: string
  avatarUrl: string | null
}

const copy = profileCopy.form
const page = profileCopy.page

export default function EditProfileForm({ fullName, phone, email, avatarUrl }: Props) {
  const [nameError, setNameError] = useState<string | null>(null)
  const [phoneError, setPhoneError] = useState<string | null>(null)

  function handleNameBlur(e: React.FocusEvent<HTMLInputElement>) {
    const raw = e.target.value.trim()
    setNameError(raw && !isValidFullName(raw) ? profileCopy.errors.invalidName : null)
  }

  function handlePhoneBlur(e: React.FocusEvent<HTMLInputElement>) {
    const raw = e.target.value.trim()
    setPhoneError(raw && !normalizeColombianPhone(raw) ? profileCopy.errors.invalidPhone : null)
  }

  const [state, action, pending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const rawName = (formData.get('full_name') as string).trim()
      if (rawName && !isValidFullName(rawName)) {
        setNameError(profileCopy.errors.invalidName)
        return { error: null }
      }
      const rawPhone = (formData.get('phone') as string).trim()
      if (rawPhone && !normalizeColombianPhone(rawPhone)) {
        setPhoneError(profileCopy.errors.invalidPhone)
        return { error: null }
      }
      const result = await updateProfile(formData)
      if (result && 'error' in result) return { error: result.error }
      toast.success(copy.saved)
      return { error: null }
    },
    { error: null },
  )

  return (
    <div className="space-y-6">
      <AvatarUploader
        avatarUrl={avatarUrl}
        name={fullName || email}
        uploadAction={uploadAvatar}
        removeAction={removeAvatar}
      />

      <form action={action} className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="full_name" className="text-sm font-medium text-foreground">
            {copy.fullName}
          </label>
          <input
            id="full_name"
            type="text"
            name="full_name"
            required
            maxLength={100}
            defaultValue={fullName}
            onBlur={handleNameBlur}
            onChange={() => nameError && setNameError(null)}
            aria-invalid={nameError ? true : undefined}
            placeholder={copy.fullNamePlaceholder}
            className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 aria-invalid:border-destructive"
          />
          {nameError && (
            <p role="alert" className="text-xs text-destructive">{nameError}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="phone" className="text-sm font-medium text-foreground">
            {copy.phone}
          </label>
          <input
            id="phone"
            type="tel"
            name="phone"
            defaultValue={phone}
            onBlur={handlePhoneBlur}
            onChange={() => phoneError && setPhoneError(null)}
            aria-invalid={phoneError ? true : undefined}
            placeholder={copy.phonePlaceholder}
            className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 aria-invalid:border-destructive"
          />
          {phoneError && (
            <p role="alert" className="text-xs text-destructive">{phoneError}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-foreground">
            {copy.email}
          </label>
          <div className="relative">
            <input
              id="email"
              type="email"
              value={email}
              disabled
              readOnly
              className="w-full h-9 rounded-lg border border-border bg-muted/50 px-3 pr-9 text-sm text-muted-foreground"
            />
            <Lock
              className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <p className="text-xs text-muted-foreground">{copy.emailHint}</p>
        </div>

        {state.error && (
          <p role="alert" className="text-sm text-destructive">{state.error}</p>
        )}

        <div className="flex gap-3 pt-1">
          <Link
            href="/"
            className="inline-flex items-center justify-center flex-1 rounded-xl border border-border text-sm font-medium min-h-11 hover:bg-muted transition-colors"
          >
            {page.back}
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
    </div>
  )
}
