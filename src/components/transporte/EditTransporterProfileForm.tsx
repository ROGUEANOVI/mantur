'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { updateTransporterProfile } from '@/app/(app)/mi-perfil-transporte/actions'
import { transportCopy } from '@/lib/copy/transport'
import { roleRequestsCopy } from '@/lib/copy/roleRequests'
import RawFileField from '@/components/shared/RawFileField'

type FormState = { error: string | null; saved: boolean }
type TransportTier = 'cooperative' | 'independent'

type Props = {
  currentTier: TransportTier
  verificationStatus: string
  cooperativeName: string | null
  cooperativeRntNumber: string | null
  cooperativeHabilitacionNumber: string | null
  driverLicenseNumber: string | null
  driverLicenseExpiry: string | null
  soatExpiryDate: string | null
}

const copy = transportCopy.editProfile
const formCopy = roleRequestsCopy.form.transporter

export default function EditTransporterProfileForm({
  currentTier,
  verificationStatus,
  cooperativeName,
  cooperativeRntNumber,
  cooperativeHabilitacionNumber,
  driverLicenseNumber,
  driverLicenseExpiry,
  soatExpiryDate,
}: Props) {
  const [tier, setTier] = useState<TransportTier>(currentTier)

  const [state, action, pending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const result = await updateTransporterProfile(formData)
      if (result && 'error' in result) return { error: result.error, saved: false }
      return { error: null, saved: true }
    },
    { error: null, saved: false },
  )

  useEffect(() => {
    if (state.error) toast.error(state.error)
    else if (state.saved) toast.success(copy.saved)
  }, [state.error, state.saved])

  return (
    <form action={action} className="space-y-5">
      {/*
        No hidden current_tier field: the server derives it from the
        authenticated transporter's own row (getAuthenticatedTransporter),
        never from client input — a security review found that trusting a
        client-supplied "did the tier change" flag let it be spoofed to
        bypass the "both documents required together" rule when actually
        switching tiers. `currentTier` here only seeds the initial radio
        selection and the tier-change warning below.
      */}

      <p className="text-xs text-muted-foreground">
        {copy.currentStatus}:{' '}
        <span className="font-medium text-foreground">
          {copy.statusLabels[verificationStatus] ?? verificationStatus}
        </span>
      </p>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">{formCopy.tier}</p>
        <div className="grid grid-cols-1 gap-2">
          {(['independent', 'cooperative'] as const).map((t) => (
            <label
              key={t}
              className="flex items-center gap-2.5 rounded-xl border border-border bg-background px-3 py-2.5 cursor-pointer text-sm text-foreground transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary"
            >
              <input
                type="radio"
                name="transport_tier"
                value={t}
                checked={tier === t}
                onChange={() => setTier(t)}
                className="accent-primary"
              />
              {t === 'cooperative' ? formCopy.tierCooperative : formCopy.tierIndependent}
            </label>
          ))}
        </div>
        {tier !== currentTier && (
          <p className="text-xs text-accent">{copy.tierChangeRequiresDocument}</p>
        )}
      </div>

      {tier === 'cooperative' ? (
        <>
          <Field label={formCopy.cooperativeName} name="cooperative_name" defaultValue={cooperativeName ?? ''} placeholder={formCopy.cooperativeNamePlaceholder} />
          <Field label={formCopy.cooperativeRntNumber} name="cooperative_rnt_number" defaultValue={cooperativeRntNumber ?? ''} placeholder={formCopy.cooperativeRntNumberPlaceholder} />
          <Field label={formCopy.cooperativeHabilitacionNumber} name="cooperative_habilitacion_number" defaultValue={cooperativeHabilitacionNumber ?? ''} placeholder={formCopy.cooperativeHabilitacionNumberPlaceholder} />
          <RawFileField label={formCopy.cooperativeDocument} name="cooperative_document" required={false} />
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{formCopy.independentHint}</p>
          <Field label={formCopy.driverLicenseNumber} name="driver_license_number" defaultValue={driverLicenseNumber ?? ''} placeholder={formCopy.driverLicenseNumberPlaceholder} />
          <Field label={formCopy.driverLicenseExpiry} name="driver_license_expiry" type="date" defaultValue={driverLicenseExpiry ?? ''} />
          <RawFileField label={formCopy.driverLicenseDocument} name="driver_license_document" required={false} />
          <Field label={formCopy.soatExpiryDate} name="soat_expiry_date" type="date" defaultValue={soatExpiryDate ?? ''} />
          <RawFileField label={formCopy.soatDocument} name="soat_document" required={false} />
        </>
      )}

      <div className="flex gap-3 pt-1">
        <Link
          href="/mi-perfil-transporte"
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

function Field({ label, name, defaultValue, placeholder, type = 'text' }: {
  label: string; name: string; defaultValue?: string; placeholder?: string; type?: string
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-sm font-medium text-foreground">{label}</label>
      <input
        id={name}
        type={type}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
      />
    </div>
  )
}
