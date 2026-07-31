import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  page: number
  totalPages: number
  totalCount: number
  pageSize: number
  baseParams: Record<string, string>
  basePath: string
}

export default function PaginationNav({
  page,
  totalPages,
  totalCount,
  pageSize,
  baseParams,
  basePath,
}: Props) {
  if (totalPages <= 1) return null

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalCount)

  function href(p: number) {
    const params = new URLSearchParams({ ...baseParams, page: String(p) })
    return `${basePath}?${params.toString()}`
  }

  const btnBase =
    'inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-[40px]'

  return (
    <div className="flex flex-col items-center gap-2 py-6">
      <p className="text-xs text-muted-foreground">
        {from}–{to} de {totalCount} resultados
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={cn(btnBase, 'text-primary hover:bg-primary/10')}>
            <ChevronLeft className="size-4" aria-hidden="true" />
            Anterior
          </Link>
        ) : (
          <span className={cn(btnBase, 'text-muted-foreground/40 pointer-events-none')}>
            <ChevronLeft className="size-4" aria-hidden="true" />
            Anterior
          </span>
        )}

        <span className="text-sm text-muted-foreground px-2">
          {page} / {totalPages}
        </span>

        {page < totalPages ? (
          <Link href={href(page + 1)} className={cn(btnBase, 'text-primary hover:bg-primary/10')}>
            Siguiente
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          <span className={cn(btnBase, 'text-muted-foreground/40 pointer-events-none')}>
            Siguiente
            <ChevronRight className="size-4" aria-hidden="true" />
          </span>
        )}
      </div>
    </div>
  )
}
