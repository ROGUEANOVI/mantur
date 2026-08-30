'use client'

import { useActionState } from 'react'
import { savePayoutAccount } from '@/app/(app)/mi-negocio/actions'
import { miNegocioCopy } from '@/lib/copy/businesses'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type FormState = { error: string | null; saved: boolean }

type Props = {
  businessId: string
  defaultValues: {
    bankName: string
    accountType: string
    accountNumber: string
    holderIdType: string
    holderIdNumber: string
    holderName: string
    holderEmail: string
  } | null
}

export default function PayoutAccountForm({ businessId, defaultValues }: Props) {
  const copy = miNegocioCopy.payout
  const boundAction = savePayoutAccount.bind(null, businessId)

  const [state, action, pending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const result = await boundAction(formData)
      if ('error' in result) return { error: result.error, saved: false }
      return { error: null, saved: true }
    },
    { error: null, saved: false },
  )

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-border bg-card shadow-sm p-5" noValidate>
      <div>
        <h2 className="text-base font-semibold text-foreground">{copy.title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{copy.subtitle}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bank_name">{copy.bankName}</Label>
        <Input
          id="bank_name"
          name="bank_name"
          required
          defaultValue={defaultValues?.bankName ?? ''}
          placeholder={copy.bankNamePlaceholder}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="account_type">{copy.accountType}</Label>
        <select
          id="account_type"
          name="account_type"
          required
          defaultValue={defaultValues?.accountType ?? ''}
          className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
        >
          <option value="" disabled>
            —
          </option>
          {Object.entries(copy.accountTypeOptions).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="account_number">{copy.accountNumber}</Label>
        <Input
          id="account_number"
          name="account_number"
          required
          defaultValue={defaultValues?.accountNumber ?? ''}
          placeholder={copy.accountNumberPlaceholder}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="holder_id_type">{copy.holderIdType}</Label>
        <select
          id="holder_id_type"
          name="holder_id_type"
          required
          defaultValue={defaultValues?.holderIdType ?? ''}
          className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
        >
          <option value="" disabled>
            —
          </option>
          {Object.entries(copy.holderIdTypeOptions).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="holder_id_number">{copy.holderIdNumber}</Label>
        <Input
          id="holder_id_number"
          name="holder_id_number"
          required
          defaultValue={defaultValues?.holderIdNumber ?? ''}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="holder_name">{copy.holderName}</Label>
        <Input
          id="holder_name"
          name="holder_name"
          required
          defaultValue={defaultValues?.holderName ?? ''}
          placeholder={copy.holderNamePlaceholder}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="holder_email">{copy.holderEmail}</Label>
        <Input
          id="holder_email"
          name="holder_email"
          type="email"
          required
          defaultValue={defaultValues?.holderEmail ?? ''}
          placeholder={copy.holderEmailPlaceholder}
        />
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.saved && (
        <p className="text-sm text-primary font-medium" role="status">
          {copy.saved}
        </p>
      )}

      <Button type="submit" className="w-full rounded-xl min-h-11" disabled={pending}>
        {pending ? copy.saving : copy.save}
      </Button>
    </form>
  )
}
