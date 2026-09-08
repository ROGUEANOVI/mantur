'use client'

import { useActionState, useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCw } from 'lucide-react'
import { toast } from 'sonner'
import { saveTransporterPayoutAccount } from '@/app/(app)/mi-perfil-transporte/actions'
import { transportCopy } from '@/lib/copy/transport'

type FormState = { error: string | null; saved: boolean }

type Props = {
  banks: { id: string; name: string }[]
  banksLoadFailed: boolean
  defaultValues: {
    bankName: string
    wompiBankId: string
    accountType: string
    accountNumber: string
    holderIdType: string
    holderIdNumber: string
    holderName: string
    holderEmail: string
  } | null
}

const copy = transportCopy.payout

export default function TransporterPayoutAccountForm({ banks, banksLoadFailed, defaultValues }: Props) {
  const router = useRouter()

  // Plain React state, not defaultValue — see GuidePayoutAccountForm's own
  // comment on why a <select> needs this after a successful form action.
  const [accountType, setAccountType] = useState(defaultValues?.accountType ?? '')
  const [holderIdType, setHolderIdType] = useState(defaultValues?.holderIdType ?? '')
  const [wompiBankId, setWompiBankId] = useState(defaultValues?.wompiBankId ?? '')

  const bankOptions =
    defaultValues?.wompiBankId && !banks.some((b) => b.id === defaultValues.wompiBankId)
      ? [{ id: defaultValues.wompiBankId, name: defaultValues.bankName }, ...banks]
      : banks
  const selectedBankName = bankOptions.find((b) => b.id === wompiBankId)?.name ?? ''

  const [state, action, pending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const result = await saveTransporterPayoutAccount(formData)
      if ('error' in result) return { error: result.error, saved: false }
      return { error: null, saved: true }
    },
    { error: null, saved: false },
  )

  useEffect(() => {
    if (state.error) toast.error(state.error)
    else if (state.saved) toast.success(copy.saved)
  }, [state])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    action(new FormData(event.currentTarget))
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-border bg-card shadow-sm p-5"
    >
      <div>
        <h2 className="text-base font-semibold text-foreground">{copy.title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{copy.subtitle}</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="wompi_bank_id" className="text-sm font-medium text-foreground">{copy.bankName}</label>
        <select
          id="wompi_bank_id"
          name="wompi_bank_id"
          required
          value={wompiBankId}
          onChange={(e) => setWompiBankId(e.target.value)}
          className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
        >
          <option value="" disabled>{copy.bankSelectPlaceholder}</option>
          {bankOptions.map((bank) => (
            <option key={bank.id} value={bank.id}>{bank.name}</option>
          ))}
        </select>
        <input type="hidden" name="bank_name" value={selectedBankName} />
        {banksLoadFailed && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <span>{copy.banksLoadError}</span>
            <button
              type="button"
              onClick={() => router.refresh()}
              className="inline-flex items-center gap-1 font-medium hover:underline cursor-pointer"
            >
              <RotateCw className="size-3.5" aria-hidden="true" />
              {copy.retry}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="account_type" className="text-sm font-medium text-foreground">{copy.accountType}</label>
        <select
          id="account_type"
          name="account_type"
          required
          value={accountType}
          onChange={(e) => setAccountType(e.target.value)}
          className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
        >
          <option value="" disabled>{copy.accountTypePlaceholder}</option>
          {Object.entries(copy.accountTypeOptions).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="account_number" className="text-sm font-medium text-foreground">{copy.accountNumber}</label>
        <input
          id="account_number"
          type="text"
          name="account_number"
          required
          defaultValue={defaultValues?.accountNumber ?? ''}
          placeholder={copy.accountNumberPlaceholder}
          className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="holder_id_type" className="text-sm font-medium text-foreground">{copy.holderIdType}</label>
        <select
          id="holder_id_type"
          name="holder_id_type"
          required
          value={holderIdType}
          onChange={(e) => setHolderIdType(e.target.value)}
          className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
        >
          <option value="" disabled>{copy.holderIdTypePlaceholder}</option>
          {Object.entries(copy.holderIdTypeOptions).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="holder_id_number" className="text-sm font-medium text-foreground">{copy.holderIdNumber}</label>
        <input
          id="holder_id_number"
          type="text"
          name="holder_id_number"
          required
          defaultValue={defaultValues?.holderIdNumber ?? ''}
          className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="holder_name" className="text-sm font-medium text-foreground">{copy.holderName}</label>
        <input
          id="holder_name"
          type="text"
          name="holder_name"
          required
          defaultValue={defaultValues?.holderName ?? ''}
          placeholder={copy.holderNamePlaceholder}
          className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="holder_email" className="text-sm font-medium text-foreground">{copy.holderEmail}</label>
        <input
          id="holder_email"
          type="email"
          name="holder_email"
          required
          defaultValue={defaultValues?.holderEmail ?? ''}
          placeholder={copy.holderEmailPlaceholder}
          className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-11 hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {pending ? copy.saving : copy.save}
      </button>
    </form>
  )
}
