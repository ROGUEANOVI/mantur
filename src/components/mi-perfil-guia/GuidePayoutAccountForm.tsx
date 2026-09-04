'use client'

import { useActionState, useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { saveGuidePayoutAccount } from '@/app/(app)/mi-perfil-guia/actions'
import { guidesCopy } from '@/lib/copy/guides'

type FormState = { error: string | null; saved: boolean }

type Props = {
  banks: { id: string; name: string }[]
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

const copy = guidesCopy.payout

export default function GuidePayoutAccountForm({ banks, defaultValues }: Props) {
  // Plain React state, not defaultValue: a <form>'s action prop puts React
  // in charge of the DOM node (React 19 resets its fields after a successful
  // action, the same way a native form does after a real submission), so a
  // <select> using defaultValue gets reset to its first option by that
  // mechanism even though the save succeeded and the value is correctly
  // persisted server-side — unlike <input>, whose defaultValue is at least
  // reflected as a real HTML attribute the reset can fall back to.
  const [accountType, setAccountType] = useState(defaultValues?.accountType ?? '')
  const [holderIdType, setHolderIdType] = useState(defaultValues?.holderIdType ?? '')
  const [wompiBankId, setWompiBankId] = useState(defaultValues?.wompiBankId ?? '')

  // If the previously saved bank id isn't in the current catalog (a transient
  // Wompi API failure, or the bank was removed from it), keep it selectable
  // as a synthetic option instead of silently blanking a valid saved value.
  const bankOptions =
    defaultValues?.wompiBankId && !banks.some((b) => b.id === defaultValues.wompiBankId)
      ? [{ id: defaultValues.wompiBankId, name: defaultValues.bankName }, ...banks]
      : banks
  const selectedBankName = bankOptions.find((b) => b.id === wompiBankId)?.name ?? ''

  const [state, action, pending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const result = await saveGuidePayoutAccount(formData)
      if ('error' in result) return { error: result.error, saved: false }
      return { error: null, saved: true }
    },
    { error: null, saved: false },
  )

  useEffect(() => {
    if (state.error) toast.error(state.error)
    else if (state.saved) toast.success(copy.saved)
  }, [state.error, state.saved])

  // Submitting via onSubmit + a manual action() call (both supported ways to
  // invoke a useActionState action, per the React docs) rather than the
  // <form action={action}> binding sidesteps the automatic post-submission
  // reset described above entirely — it's specifically tied to that binding,
  // not to useActionState itself.
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
          <option value="" disabled>—</option>
          {bankOptions.map((bank) => (
            <option key={bank.id} value={bank.id}>{bank.name}</option>
          ))}
        </select>
        <input type="hidden" name="bank_name" value={selectedBankName} />
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
          <option value="" disabled>—</option>
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
          <option value="" disabled>—</option>
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
