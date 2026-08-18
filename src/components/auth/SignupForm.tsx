'use client'

import { useActionState, useState } from 'react'

import { signUp } from '@/app/(auth)/actions'
import { authCopy } from '@/lib/copy/auth'
import { isValidFullName } from '@/lib/name'
import { isPasswordValid } from '@/lib/password'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'
import PasswordInput from '@/components/auth/PasswordInput'
import PasswordRequirements from '@/components/auth/PasswordRequirements'

type FormState = { error: string | null; pendingConfirmation?: boolean }

const copy = authCopy.signup

export default function SignupForm() {
  const [showPassword, setShowPassword] = useState(false)
  const [password, setPassword]       = useState('')
  const [pwTouched, setPwTouched]     = useState(false)
  const [nameError, setNameError]     = useState<string | null>(null)

  function handleNameBlur(e: React.FocusEvent<HTMLInputElement>) {
    const raw = e.target.value.trim()
    setNameError(raw && !isValidFullName(raw) ? copy.errors.invalidName : null)
  }

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const name = (formData.get('full_name') as string).trim()
      if (!name)                  return { error: copy.errors.nameRequired }
      if (!isValidFullName(name)) { setNameError(copy.errors.invalidName); return { error: null } }
      const pw  = formData.get('password') as string
      if (!isPasswordValid(pw))  return { error: copy.errors.weakPassword }
      const result = await signUp(formData)
      return result ?? { error: null }
    },
    { error: null },
  )

  if (state.pendingConfirmation) {
    return (
      <div className="space-y-2 text-center">
        <h2 className="text-lg font-semibold text-foreground">
          {authCopy.signup.confirmationSent.title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {authCopy.signup.confirmationSent.body}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-5" noValidate>
        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor="signup-name">{copy.fullName}</Label>
          <Input
            id="signup-name"
            type="text"
            name="full_name"
            required
            autoComplete="name"
            onBlur={handleNameBlur}
            onChange={() => nameError && setNameError(null)}
            aria-invalid={nameError ? true : undefined}
            placeholder="Tu nombre completo"
            className="aria-invalid:border-destructive"
          />
          {nameError && (
            <p role="alert" className="text-xs text-destructive">{nameError}</p>
          )}
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <Label htmlFor="signup-email">{copy.email}</Label>
          <Input
            id="signup-email"
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="tu@correo.com"
          />
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <Label htmlFor="signup-password">{copy.password}</Label>
          <PasswordInput
            id="signup-password"
            name="password"
            show={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
            autoComplete="new-password"
            placeholder="Tu contraseña"
            value={password}
            onChange={(v) => { setPassword(v); setPwTouched(true) }}
          />

          {/* Requirements — shown once user starts typing */}
          {pwTouched && (
            <div className="pt-1">
              <PasswordRequirements password={password} />
            </div>
          )}
        </div>

        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}

        <Button type="submit" className="w-full hover:-translate-y-0.5" disabled={pending}>
          {pending ? 'Creando cuenta...' : copy.submit}
        </Button>
      </form>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">{authCopy.oauth.divider}</span>
        </div>
      </div>

      <GoogleSignInButton />
    </div>
  )
}
