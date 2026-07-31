'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function SearchInput({
  placeholder,
  dark = false,
}: {
  placeholder: string
  dark?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Initialize empty to avoid server/client hydration mismatch;
  // sync with URL param after mount.
  const [value, setValue] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setValue(searchParams.get('q') ?? '')
  }, [searchParams])

  function pushUrl(q: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (q) {
      params.set('q', q)
    } else {
      params.delete('q')
    }
    params.delete('page')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value
    setValue(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => pushUrl(next), 350)
  }

  function handleClear() {
    setValue('')
    pushUrl('')
  }

  useEffect(() => {
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative">
      <Search
        className={cn(
          'absolute left-3 top-1/2 -translate-y-1/2 size-4 pointer-events-none',
          dark ? 'text-white/60' : 'text-muted-foreground',
        )}
        aria-hidden="true"
      />
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className={cn(
          'w-full h-10 rounded-xl pl-9 pr-9 text-sm focus:outline-none focus:ring-2 transition-[border,box-shadow]',
          dark
            ? 'bg-white/15 border border-white/25 text-white placeholder:text-white/50 focus:ring-white/30 focus:border-white/50'
            : 'bg-card border border-border text-foreground placeholder:text-muted-foreground focus:ring-ring/50 focus:border-ring',
        )}
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Limpiar búsqueda"
          className={cn(
            'absolute right-3 top-1/2 -translate-y-1/2 transition-colors',
            dark ? 'text-white/60 hover:text-white' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
