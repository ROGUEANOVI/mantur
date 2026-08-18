'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'

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

  if (state.emailSent) {
    return (
      <div className="space-y-2 text-center">
        <h2 className="text-lg font-semibold text-foreground">{copy.confirmationSent.title}</h2>
        <p className="text-sm text-muted-foreground">{copy.confirmationSent.body}</p>
        <p className="text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            {copy.backToLogin}
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {authError === 'expired' && (
        <p role="alert" className="text-sm text-destructive">
          {copy.errors.expiredLink}
        </p>
      )}

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

        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}

        <Button type="submit" className="w-full hover:-translate-y-0.5" disabled={pending}>
          {pending ? 'Enviando...' : copy.submit}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          {copy.backToLogin}
        </Link>
      </p>
    </div>
  )
}
