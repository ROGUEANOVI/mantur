'use client'

import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { requestPasswordReset } from '@/app/(auth)/actions'
import { authCopy } from '@/lib/copy/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type FormState = { error: string | null; emailSent?: boolean }

async function requestResetAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await requestPasswordReset(formData)
  return result ?? { error: null }
}

const copy = authCopy.forgotPassword

export default function ForgotPasswordForm({ authError }: { authError?: 'expired' }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    requestResetAction,
    { error: null },
  )

  // Controlled input: React's form actions reset uncontrolled fields after
  // every submit (success or failure) — without this, a failed request wipes
  // the email the user just typed.
  const [email, setEmail] = useState('')

  useEffect(() => {
    if (authError === 'expired') toast.error(copy.errors.expiredLink)
  }, [authError])

  useEffect(() => {
    if (state.error) toast.error(state.error)
  }, [state.error])

  if (state.emailSent) {
    return (
      <div className="space-y-2 text-center">
        <h2 className="text-lg font-semibold text-foreground">{copy.confirmationSent.title}</h2>
        <p className="text-sm text-muted-foreground">{copy.confirmationSent.body}</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-5" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="forgot-email">{copy.email}</Label>
          <Input
            id="forgot-email"
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <Button type="submit" className="w-full hover:-translate-y-0.5" disabled={pending}>
          {pending ? 'Enviando...' : copy.submit}
        </Button>
      </form>
    </div>
  )
}
