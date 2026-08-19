'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Menu, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ADMIN_NAV_GROUPS, type AdminNavItem } from './admin-nav'

const HEADER_OFFSET = 'top-14' // 3.5rem — below the sticky site header
const EXIT_MS = 200

function isItemActive(item: AdminNavItem, pathname: string) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href)
}

function currentLabel(pathname: string) {
  const items = ADMIN_NAV_GROUPS.flat()
  const active = items
    .filter((item) => isItemActive(item, pathname))
    .sort((a, b) => b.href.length - a.href.length)[0]
  return active?.label ?? 'Menú'
}

export default function AdminMobileMenu() {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false) // drawer is in the DOM
  const [entered, setEntered] = useState(false) // drawer has slid in from the left
  const pathname = usePathname()
  const exitTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setMounted(true)
    return () => {
      if (exitTimeout.current) clearTimeout(exitTimeout.current)
    }
  }, [])

  const openMenu = () => {
    if (exitTimeout.current) clearTimeout(exitTimeout.current)
    setVisible(true)
    // Double rAF: let the closed (translate-x-full) state paint first, then
    // flip to entered so the transition actually plays instead of skipping.
    requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)))
  }

  const closeMenu = () => {
    setEntered(false)
    exitTimeout.current = setTimeout(() => setVisible(false), EXIT_MS)
  }

  useEffect(() => {
    closeMenu()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  useEffect(() => {
    if (!visible) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [visible])

  return (
    <div className={cn('lg:hidden sticky z-10 border-b border-border bg-card/90 backdrop-blur-sm', HEADER_OFFSET)}>
      <button
        type="button"
        aria-label={visible ? 'Cerrar menú' : 'Abrir menú'}
        aria-expanded={visible}
        onClick={() => (visible ? closeMenu() : openMenu())}
        className="flex items-center gap-2 min-h-11 w-full px-3 text-sm font-medium text-foreground"
      >
        {visible ? (
          <X className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        ) : (
          <Menu className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        )}
        {currentLabel(pathname)}
      </button>

      {visible && mounted && createPortal(
        <>
          {/* Backdrop */}
          <div
            className={cn(
              'fixed inset-0 z-10 bg-black/20 backdrop-blur-sm transition-opacity motion-reduce:transition-none',
              HEADER_OFFSET,
              entered ? 'duration-300 opacity-100' : 'duration-200 opacity-0',
            )}
            onClick={closeMenu}
            aria-hidden="true"
          />
          {/* Drawer — slides in from the left, same grouping/order/icons as the
              desktop sidebar, which also lives on the left edge. */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menú de administración"
            className={cn(
              'fixed left-0 bottom-0 z-20 w-72 max-w-[85vw] border-r border-border bg-background shadow-xl overflow-y-auto',
              'transition-transform will-change-transform motion-reduce:transition-none motion-reduce:transform-none',
              HEADER_OFFSET,
              entered
                ? 'translate-x-0 duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]'
                : '-translate-x-full duration-200 ease-in',
            )}
          >
            <nav className="p-2">
              {ADMIN_NAV_GROUPS.map((group, gi) => (
                <div key={gi}>
                  {gi > 0 && <div className="my-1.5 mx-2 border-t border-border" />}
                  <div className="space-y-0.5">
                    {group.map(({ href, label, exact, Icon }) => {
                      const isActive = isItemActive({ href, label, exact, Icon }, pathname)
                      return (
                        <a
                          key={href}
                          href={href}
                          className={cn(
                            'flex items-center gap-2.5 min-h-11 px-3 text-sm rounded-lg transition-colors',
                            isActive
                              ? 'text-foreground font-semibold bg-muted'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                          )}
                        >
                          <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                          {label}
                        </a>
                      )
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
