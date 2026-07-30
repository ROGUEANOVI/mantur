'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { MapPin, Store, Car } from 'lucide-react'

import { signUp } from '@/app/(auth)/actions'
import { authCopy } from '@/lib/copy/auth'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Role = 'tourist' | 'business_owner' | 'transporter'
type FormState = { error: string | null }

async function signupAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await signUp(formData)
  // signUp either redirects (success) or returns { error }
  return result ?? { error: null }
}

const copy = authCopy.signup

// Role selector card definition — keeps JSX clean below
const ROLE_OPTIONS: { value: Role; label: string; Icon: React.ElementType }[] = [
  { value: 'tourist', label: copy.roles.tourist, Icon: MapPin },
  { value: 'business_owner', label: copy.roles.business_owner, Icon: Store },
  { value: 'transporter', label: copy.roles.transporter, Icon: Car },
]

export default function SignupForm() {
  const [selectedRole, setSelectedRole] = useState<Role>('tourist')

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    signupAction,
    { error: null },
  )

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {/* Full name */}
      <div className="space-y-1.5">
        <Label htmlFor="signup-name">{copy.fullName}</Label>
        <Input
          id="signup-name"
          type="text"
          name="full_name"
          required
          autoComplete="name"
          placeholder="Tu nombre completo"
        />
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
        <Input
          id="signup-password"
          type="password"
          name="password"
          required
          minLength={6}
          autoComplete="new-password"
          placeholder="Mínimo 6 caracteres"
        />
      </div>

      {/* Role selector */}
      <div className="space-y-2">
        {/* Not a <label> because the role options are <button>s, not inputs */}
        <p className="text-sm font-medium leading-none select-none">
          {copy.roleLabel}
        </p>

        {/*
         * Three cards stacked vertically on mobile, side-by-side on md+.
         * The hidden input carries the selected value to the Server Action.
         */}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {ROLE_OPTIONS.map(({ value, label, Icon }) => {
            const isSelected = selectedRole === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setSelectedRole(value)}
                aria-pressed={isSelected}
                className={cn(
                  'flex flex-row md:flex-col items-center gap-3 md:gap-2 rounded-xl border p-3 text-left transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-background hover:bg-muted',
                )}
              >
                <Icon
                  className={cn(
                    'size-5 shrink-0',
                    isSelected ? 'text-primary' : 'text-muted-foreground',
                  )}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    'text-sm font-medium leading-tight',
                    isSelected ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {label}
                </span>
              </button>
            )
          })}
        </div>

        {/* Passes the selected role value to the Server Action */}
        <input type="hidden" name="role" value={selectedRole} />
      </div>

      {/* Inline error */}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      {/* Submit */}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Creando cuenta...' : copy.submit}
      </Button>

      {/* Link to login */}
      <p className="text-center text-sm text-muted-foreground">
        {copy.hasAccount}{' '}
        <Link
          href="/login"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {copy.loginLink}
        </Link>
      </p>
    </form>
  )
}
