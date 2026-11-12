import { cn } from '@/lib/utils'
import type { PriceHeadline } from '@/lib/packages/price'

type Variant = 'onPhoto' | 'card' | 'detail' | 'compact'

// Renders a package price headline (src/lib/packages/price.ts) the same way
// everywhere: group label, main amount + unit, and the per-person / minimum
// detail. Pure markup — usable from server and client components.
export default function PackagePrice({
  headline,
  variant,
  className,
}: {
  headline: PriceHeadline
  variant: Variant
  className?: string
}) {
  const s = STYLES[variant]
  return (
    <div className={cn('min-w-0', className)}>
      <p className={s.line}>
        {headline.label && <span className={s.label}>{headline.label}: </span>}
        <span className={s.amount}>{headline.amount}</span>
        {headline.unit && <span className={s.unit}> {headline.unit}</span>}
      </p>
      {headline.detail && <p className={s.detail}>{headline.detail}</p>}
    </div>
  )
}

const STYLES: Record<Variant, { line: string; label: string; amount: string; unit: string; detail: string }> = {
  onPhoto: {
    line: 'text-white',
    label: 'text-sm font-semibold',
    amount: 'text-xl font-extrabold tabular-nums',
    unit: 'text-xs text-white/75',
    detail: 'text-xs text-white/75 tabular-nums',
  },
  card: {
    line: 'text-sm text-muted-foreground',
    label: 'font-medium text-foreground',
    amount: 'text-base font-semibold text-accent tabular-nums',
    unit: '',
    detail: 'text-xs text-muted-foreground tabular-nums',
  },
  detail: {
    line: 'text-sm text-muted-foreground',
    label: 'text-base font-semibold text-foreground',
    amount: 'text-2xl font-extrabold text-accent tabular-nums',
    unit: '',
    detail: 'mt-0.5 text-sm text-muted-foreground tabular-nums',
  },
  compact: {
    line: 'truncate text-sm text-foreground',
    label: 'text-xs text-muted-foreground',
    amount: 'text-base font-extrabold tabular-nums',
    unit: 'text-xs text-muted-foreground',
    detail: 'truncate text-xs text-muted-foreground tabular-nums',
  },
}
