'use client'

import { useActionState, useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { toast } from 'sonner'

import { updatePassword } from '@/app/(auth)/actions'
import { authCopy } from '@/lib/copy/auth'
import { isPasswordValid } from '@/lib/password'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import PasswordInput from '@/components/auth/PasswordInput'
import PasswordRequirements from '@/components/auth/PasswordRequirements'

type FormState = { error: string | null }

const copy = authCopy.resetPassword

export default function ResetPasswordForm() {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pwTouched, setPwTouched] = useState(false)

  const passwordsMatch = confirm.length > 0 && password === confirm
  const passwordsMismatch = confirm.length > 0 && password !== confirm

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const pw = formData.get('password') as string
      const cfm = formData.get('confirm_password') as string
      if (!isPasswordValid(pw)) return { error: copy.errors.weakPassword }
      if (pw !== cfm) return { error: copy.errors.passwordMismatch }
      const result = await updatePassword(formData)
      return result ?? { error: null }
    },
    { error: null },
  )

  useEffect(() => {
    if (state.error) toast.error(state.error)
  }, [state.error])

  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-5" noValidate>
        {/* New password */}
        <div className="space-y-1.5">
          <Label htmlFor="reset-password">{copy.password}</Label>
          <PasswordInput
            id="reset-password"
            name="password"
            show={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
            autoComplete="new-password"
            placeholder="Tu nueva contraseña"
            value={password}
            onChange={(v) => { setPassword(v); setPwTouched(true) }}
          />

          {pwTouched && (
            <div className="pt-1">
              <PasswordRequirements password={password} />
            </div>
          )}
        </div>

        {/* Confirm password */}
        <div className="space-y-1.5">
          <Label htmlFor="reset-confirm">{copy.confirmPassword}</Label>
          <PasswordInput
            id="reset-confirm"
            name="confirm_password"
            show={showConfirm}
            onToggle={() => setShowConfirm((v) => !v)}
            autoComplete="new-password"
            placeholder="Repite tu nueva contraseña"
            value={confirm}
            onChange={setConfirm}
          />
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

        <Button type="submit" className="w-full hover:-translate-y-0.5" disabled={pending}>
          {pending ? 'Guardando...' : copy.submit}
        </Button>
      </form>
    </div>
  )
}
