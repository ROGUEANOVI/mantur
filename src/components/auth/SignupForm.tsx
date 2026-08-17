'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Check, X } from 'lucide-react'

import { signUp } from '@/app/(auth)/actions'
import { authCopy } from '@/lib/copy/auth'
import { isValidFullName } from '@/lib/name'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'
import PasswordInput from '@/components/auth/PasswordInput'

type FormState = { error: string | null; pendingConfirmation?: boolean }

const copy = authCopy.signup

const RULES = [
  { key: 'minLength', label: copy.passwordRules.minLength, test: (p: string) => p.length >= 8 },
  { key: 'uppercase', label: copy.passwordRules.uppercase, test: (p: string) => /[A-Z]/.test(p) },
  { key: 'digit',     label: copy.passwordRules.digit,     test: (p: string) => /[0-9]/.test(p) },
  { key: 'special',   label: copy.passwordRules.special,   test: (p: string) => /[^A-Za-z0-9]/.test(p) },
]

function isPasswordValid(p: string) {
  return RULES.every((r) => r.test(p))
}

export default function SignupForm() {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [password, setPassword]       = useState('')
  const [confirm, setConfirm]         = useState('')
  const [pwTouched, setPwTouched]     = useState(false)
  const [nameError, setNameError]     = useState<string | null>(null)

  const passwordsMatch = confirm.length > 0 && password === confirm
  const passwordsMismatch = confirm.length > 0 && password !== confirm

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
      const cfm = formData.get('confirm_password') as string
      if (!isPasswordValid(pw))  return { error: copy.errors.weakPassword }
      if (pw !== cfm)            return { error: copy.errors.passwordMismatch }
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
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {RULES.map(({ key, label, test }) => {
                const met = test(password)
                return (
                  <div
                    key={key}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                      met
                        ? 'bg-primary/10 text-primary'
                        : 'bg-destructive/10 text-destructive',
                    )}
                  >
                    {met
                      ? <Check className="size-3 shrink-0" aria-hidden="true" />
                      : <X     className="size-3 shrink-0" aria-hidden="true" />
                    }
                    {label}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Confirm password */}
        <div className="space-y-1.5">
          <Label htmlFor="signup-confirm">{copy.confirmPassword}</Label>
          <PasswordInput
            id="signup-confirm"
            name="confirm_password"
            show={showConfirm}
            onToggle={() => setShowConfirm((v) => !v)}
            autoComplete="new-password"
            placeholder="Repite tu contraseña"
            value={confirm}
            onChange={setConfirm}
          />
          {/* Real-time match feedback */}
          {passwordsMatch && (
            <p className="flex items-center gap-1 text-xs text-primary">
              <Check className="size-3" aria-hidden="true" />
              Las contraseñas coinciden
            </p>
          )}
          {passwordsMismatch && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <X className="size-3" aria-hidden="true" />
              Las contraseñas no coinciden
            </p>
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

      <p className="text-center text-sm text-muted-foreground">
        {copy.hasAccount}{' '}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          {copy.loginLink}
        </Link>
      </p>
    </div>
  )
}
