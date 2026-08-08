'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import TransportRequestForm from '@/components/transporte/TransportRequestForm'
import { transportCopy } from '@/lib/copy/transport'
import { cn } from '@/lib/utils'
import Avatar from '@/components/shared/Avatar'

type Access = 'tourist' | 'guest' | 'other_role'

type Props = {
  transporter: {
    vehicle_type: string
    license_plate: string
    phone: string
    bio: string | null
    full_name: string | null
    avatar_url: string | null
  }
  access: Access
}

export default function TransporterCardWithModal({ transporter, access }: Props) {
  const [open, setOpen] = useState(false)
  const copy = transportCopy.publicPage

  function handleRequest() {
    if (access === 'guest') {
      window.location.href = '/login?next=/transportistas'
      return
    }
    setOpen(true)
  }

  const vehicleLabel =
    copy.vehicleTypes[transporter.vehicle_type] ?? transporter.vehicle_type

  // No dedicated /transportistas/[id] page exists — unlike negocios/lugares/
  // guias, there's nowhere for the whole card to navigate to. The closest
  // equivalent to "whole card clickable" is making it trigger the same
  // request-a-ride action as the button, when that action is available.
  const clickable = access !== 'other_role'

  return (
    <>
      <div
        onClick={clickable ? handleRequest : undefined}
        className={cn(
          'rounded-2xl border border-border bg-card shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all p-4',
          clickable && 'cursor-pointer active:scale-[0.98]'
        )}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <Avatar name={transporter.full_name ?? 'Transportador'} avatarUrl={transporter.avatar_url} size="sm" />
            <div>
              <p className="font-semibold text-foreground text-sm">
                {transporter.full_name ?? 'Transportador'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {vehicleLabel} · {transporter.license_plate}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2.5 py-0.5 text-xs font-semibold shrink-0">
            {copy.available}
          </span>
        </div>

        {transporter.bio && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {transporter.bio}
          </p>
        )}

        {access !== 'other_role' && (
          <button
            type="button"
            onClick={handleRequest}
            className="inline-flex items-center justify-center w-full rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-11 px-4 hover:bg-primary/90 active:scale-[0.98] transition-all"
          >
            {copy.requestRide}
          </button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{copy.modalTitle}</DialogTitle>
          </DialogHeader>

          {/* Transporter context */}
          <div className="rounded-xl bg-muted/50 border border-border p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">
              {copy.modalDriverLabel}
            </p>
            <div className="flex items-center gap-2.5">
              <Avatar name={transporter.full_name ?? 'Transportador'} avatarUrl={transporter.avatar_url} size="sm" className="size-8 text-xs" />
              <div>
                <p className="font-semibold text-sm text-foreground leading-tight">
                  {transporter.full_name ?? 'Transportador'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {vehicleLabel} · {transporter.license_plate}
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground/70 italic">
              {copy.modalNote}
            </p>
          </div>

          <TransportRequestForm />
        </DialogContent>
      </Dialog>
    </>
  )
}
