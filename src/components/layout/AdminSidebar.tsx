'use client'

import NavLink from './NavLink'
import { cn } from '@/lib/utils'
import { ADMIN_NAV_GROUPS } from './admin-nav'

const Divider = () => (
  <div className="my-1.5 mx-2 border-t border-border" />
)

export default function AdminSidebar() {
  return (
    <aside className="group hidden lg:flex flex-col bg-background border-r border-t border-border fixed left-0 top-14 h-[calc(100vh-3.5rem)] z-20 overflow-hidden w-14 hover:w-56 transition-[width] duration-300 ease-in-out">
      <nav className="p-2 pt-2 flex-1">
        {ADMIN_NAV_GROUPS.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <Divider />}
            <div className="space-y-0.5">
              {group.map(({ href, label, exact, Icon }) => (
                <NavLink
                  key={href}
                  href={href}
                  exact={exact}
                  className="flex items-center gap-2.5 py-2 px-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                  activeClassName="text-foreground font-semibold bg-muted"
                >
                  <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                  <span className="whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-100">
                    {label}
                  </span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}
