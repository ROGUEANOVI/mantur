'use client'

import NavLink from './NavLink'
import { ADMIN_NAV_GROUPS, type AdminNavCountKey } from './admin-nav'

const Divider = () => (
  <div className="my-1.5 mx-2 border-t border-border" />
)

export default function AdminSidebar({
  navCounts,
}: {
  navCounts?: Partial<Record<AdminNavCountKey, number>>
}) {
  return (
    <aside className="group hidden lg:flex flex-col bg-background border-r border-t border-border fixed left-0 top-14 h-[calc(100vh-3.5rem)] z-20 overflow-hidden w-14 hover:w-56 transition-[width] duration-300 ease-in-out">
      <nav className="p-2 pt-2 flex-1">
        {ADMIN_NAV_GROUPS.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <Divider />}
            <div className="space-y-0.5">
              {group.map(({ href, label, exact, Icon, countKey }) => {
                const count = countKey ? navCounts?.[countKey] ?? 0 : 0
                return (
                  <NavLink
                    key={href}
                    href={href}
                    exact={exact}
                    className="flex items-center gap-2.5 py-2 px-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                    activeClassName="text-foreground font-semibold bg-muted"
                  >
                    <span className="relative shrink-0">
                      <Icon className="size-4" strokeWidth={1.5} aria-hidden="true" />
                      {count > 0 && (
                        <span
                          className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-accent group-hover:opacity-0 transition-opacity duration-150"
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    <span className="flex items-center gap-2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-100">
                      {label}
                      {count > 0 && (
                        <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-accent/15 text-accent text-[11px] font-semibold tabular-nums">
                          {count}
                        </span>
                      )}
                    </span>
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}
