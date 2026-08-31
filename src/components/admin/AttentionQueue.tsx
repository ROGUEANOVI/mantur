import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { adminCopy } from '@/lib/copy/admin'

export type QueueTone = 'critical' | 'warning' | 'default'

export type PendingQueueItem = {
  key: string
  label: string
  count: number
  icon: LucideIcon
  tone: QueueTone
  href?: string
  hint?: string
}

const TONE_CLASSES: Record<QueueTone, { chip: string; count: string }> = {
  critical: { chip: 'bg-destructive/10 text-destructive', count: 'text-destructive' },
  warning: { chip: 'bg-accent/15 text-accent', count: 'text-accent' },
  default: { chip: 'bg-primary/10 text-primary', count: 'text-primary' },
}

// Unified "what needs my attention" queue — merges pending businesses, role
// requests, refunds, compliance backlogs, and stuck payouts into one
// priority-ordered list instead of forcing an admin to check six pages.
export default function AttentionQueue({ items }: { items: PendingQueueItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card shadow-sm p-6 text-center">
        <CheckCircle2 className="size-8 text-primary/30 mx-auto mb-2" strokeWidth={1.5} aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{adminCopy.dashboard.attention.empty}</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm divide-y divide-border">
      {items.map((item) => {
        const Icon = item.icon
        const tone = TONE_CLASSES[item.tone]
        const row = (
          <div className="flex items-center gap-3 p-3">
            <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tone.chip)}>
              <Icon className="size-4" strokeWidth={1.5} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground leading-snug">{item.label}</p>
              {item.hint && <p className="text-xs text-muted-foreground mt-0.5">{item.hint}</p>}
            </div>
            <span className={cn('text-lg font-bold shrink-0 tabular-nums', tone.count)}>{item.count}</span>
          </div>
        )
        return item.href ? (
          <Link key={item.key} href={item.href} className="block hover:bg-muted/50 transition-colors">
            {row}
          </Link>
        ) : (
          <div key={item.key}>{row}</div>
        )
      })}
    </div>
  )
}
