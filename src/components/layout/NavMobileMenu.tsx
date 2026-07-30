'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { usePathname } from 'next/navigation'

type NavLink = { label: string; href: string }

export default function NavMobileMenu({
  links,
  children,
}: {
  links: NavLink[]
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close when navigating
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <>
      <button
        type="button"
        aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center size-10 rounded-lg text-foreground hover:bg-muted/60 transition-colors"
      >
        {open ? (
          <X className="size-5" aria-hidden="true" />
        ) : (
          <Menu className="size-5" aria-hidden="true" />
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 top-14 z-10 bg-black/20 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div className="absolute left-0 right-0 top-full z-20 border-b border-border bg-background shadow-lg">
            <nav className="flex flex-col divide-y divide-border">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-4 py-4 text-base font-medium text-foreground hover:bg-muted/50 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="px-4 py-4 border-t border-border">{children}</div>
          </div>
        </>
      )}
    </>
  )
}
