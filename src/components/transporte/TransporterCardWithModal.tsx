'use client'

import { useState } from 'react'
import { Car } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import TransportRequestForm from '@/components/transporte/TransportRequestForm'
import { transportCopy } from '@/lib/copy/transport'

type Access = 'tourist' | 'guest' | 'other_role'

type Props = {
  transporter: {
    vehicle_type: string
    license_plate: string
    phone: string
    bio: string | null
    full_name: string | null
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

  return (
    <>
      <div className="rounded-2xl border border-border bg-card shadow-sm p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Car className="size-5 text-primary" strokeWidth={1.5} aria-hidden="true" />
            </div>
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
            className="inline-flex items-center justify-center w-full rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-11 px-4 hover:bg-primary/90 transition-colors"
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
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Car className="size-4 text-primary" strokeWidth={1.5} aria-hidden="true" />
              </div>
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
