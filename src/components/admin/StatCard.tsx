import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import Sparkline from './Sparkline'

type StatCardProps = {
  icon: LucideIcon
  iconColor: string
  label: string
  value: string | number
  valueColor?: string
  valueSmall?: boolean
  href?: string
  trend?: number[]
  trendLabel?: string
}

export default function StatCard({
  icon: Icon,
  iconColor,
  label,
  value,
  valueColor,
  valueSmall,
  href,
  trend,
  trendLabel,
}: StatCardProps) {
  const content = (
    <div className="rounded-2xl border border-border bg-card shadow-sm p-4 h-full">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn('size-4', iconColor)} aria-hidden="true" strokeWidth={1.5} />
        <p className="text-xs text-muted-foreground leading-tight">{label}</p>
      </div>
      <p className={cn('font-bold text-foreground', valueSmall ? 'text-xl' : 'text-3xl', valueColor)}>
        {value}
      </p>
      {trend && trend.length > 1 && (
        <div className="mt-2 flex items-center gap-2">
          <Sparkline data={trend} />
          {trendLabel && <span className="text-[11px] text-muted-foreground">{trendLabel}</span>}
        </div>
      )}
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="block hover:opacity-80 transition-opacity">
        {content}
      </Link>
    )
  }
  return content
}
