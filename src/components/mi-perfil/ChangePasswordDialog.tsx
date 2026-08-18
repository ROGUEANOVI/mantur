'use client'

import { useActionState, useState } from 'react'
import { toast } from 'sonner'
import { Check, Lock, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { changePassword } from '@/app/(app)/mi-perfil/actions'
import { profileCopy } from '@/lib/copy/profile'
import { isPasswordValid, PASSWORD_RULES } from '@/lib/password'
import PasswordInput from '@/components/auth/PasswordInput'

type FormState = { error: string | null }

const copy = profileCopy.changePassword

export default function ChangePasswordDialog() {
  const [open, setOpen] = useState(false)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwTouched, setPwTouched] = useState(false)

  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword
  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword

  function resetFields() {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPwTouched(false)
    setShowCurrent(false)
    setShowNew(false)
    setShowConfirm(false)
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) resetFields()
  }

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const newPw = formData.get('new_password') as string
      const confirmPw = formData.get('confirm_password') as string
      if (!isPasswordValid(newPw)) return { error: profileCopy.errors.weakPassword }
      if (newPw !== confirmPw) return { error: profileCopy.errors.passwordMismatch }
      const result = await changePassword(formData)
      if (result && 'error' in result) return { error: result.error }
      toast.success(copy.saved)
      setOpen(false)
      resetFields()
      return { error: null }
    },
    { error: null },
  )

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="w-full justify-start gap-2 text-sm font-medium"
      >
        <Lock className="size-4" aria-hidden="true" />
        {copy.trigger}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>

          <form id="change-password-form" action={formAction} className="space-y-5" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="current-password">{copy.currentPassword}</Label>
              <PasswordInput
                id="current-password"
                name="current_password"
                show={showCurrent}
                onToggle={() => setShowCurrent((v) => !v)}
                autoComplete="current-password"
                value={currentPassword}
                onChange={setCurrentPassword}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-password">{copy.newPassword}</Label>
              <PasswordInput
                id="new-password"
                name="new_password"
                show={showNew}
                onToggle={() => setShowNew((v) => !v)}
                autoComplete="new-password"
                value={newPassword}
                onChange={(v) => { setNewPassword(v); setPwTouched(true) }}
              />

              {pwTouched && (
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {PASSWORD_RULES.map(({ key, label, test }) => {
                    const met = test(newPassword)
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

            <div className="space-y-1.5">
              <Label htmlFor="confirm-new-password">{copy.confirmPassword}</Label>
              <PasswordInput
                id="confirm-new-password"
                name="confirm_password"
                show={showConfirm}
                onToggle={() => setShowConfirm((v) => !v)}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={setConfirmPassword}
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

            {state.error && (
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            )}
          </form>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {copy.cancel}
            </Button>
            <Button type="submit" form="change-password-form" disabled={pending}>
              {pending ? copy.saving : copy.submit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
