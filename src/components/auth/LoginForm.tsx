'use client'

import { useActionState } from 'react'
import Link from 'next/link'

import { signIn } from '@/app/(auth)/actions'
import { authCopy } from '@/lib/copy/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// useActionState expects the action to accept (prevState, formData).
// We wrap signIn so the signature matches while keeping the Server Action pure.
type FormState = { error: string | null }

async function loginAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await signIn(formData)
  // signIn either redirects (success) or returns { error }
  return result ?? { error: null }
}

const copy = authCopy.login

export default function LoginForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    loginAction,
    { error: null },
  )

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {/* Email */}
      <div className="space-y-1.5">
        <Label htmlFor="login-email">{copy.email}</Label>
        <Input
          id="login-email"
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="tu@correo.com"
        />
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <Label htmlFor="login-password">{copy.password}</Label>
        <Input
          id="login-password"
          type="password"
          name="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
        />
      </div>

      {/* Inline error — only rendered when the server action returns one */}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      {/* Submit */}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Iniciando sesión...' : copy.submit}
      </Button>

      {/* Link to signup */}
      <p className="text-center text-sm text-muted-foreground">
        {copy.noAccount}{' '}
        <Link
          href="/signup"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {copy.signupLink}
        </Link>
      </p>
    </form>
  )
}
