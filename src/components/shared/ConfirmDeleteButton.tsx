'use client'

import { useState, type ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Props = {
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  trigger: ReactNode
  triggerClassName?: string
  triggerAriaLabel?: string
  disabled?: boolean
  /** Id of a `<form>` elsewhere in the document to submit on confirm (Server Action forms). */
  formId?: string
  /** Client-side callback to run on confirm, used instead of `formId`. */
  onConfirm?: () => void
}

export default function ConfirmDeleteButton({
  title,
  description,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  trigger,
  triggerClassName,
  triggerAriaLabel,
  disabled,
  formId,
  onConfirm,
}: Props) {
  const [open, setOpen] = useState(false)

  function handleConfirm() {
    setOpen(false)
    onConfirm?.()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label={triggerAriaLabel}
        className={triggerClassName}
      >
        {trigger}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {cancelLabel}
            </Button>
            {formId ? (
              <Button
                type="submit"
                form={formId}
                variant="destructive"
                onClick={() => setOpen(false)}
              >
                {confirmLabel}
              </Button>
            ) : (
              <Button type="button" variant="destructive" onClick={handleConfirm}>
                {confirmLabel}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
