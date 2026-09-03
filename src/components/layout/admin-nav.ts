import { LayoutDashboard, Building2, TreePine, Percent, Tag, Layers, Users, Car, Compass, IdCard, Undo2, Package, type LucideIcon } from 'lucide-react'

export type AdminNavCountKey = 'negocios' | 'solicitudes' | 'reembolsos' | 'paquetesSolicitudes'

export type AdminNavItem = {
  href: string
  label: string
  exact: boolean
  Icon: LucideIcon
  countKey?: AdminNavCountKey
}

// Single source of truth for admin nav — desktop sidebar and mobile tab bar
// both render this, grouped, in the same order. Items with a countKey pick
// up a pending-count badge from the navCounts prop (see pendingCounts.ts).
export const ADMIN_NAV_GROUPS: AdminNavItem[][] = [
  [
    { href: '/admin', label: 'Dashboard', exact: true, Icon: LayoutDashboard },
  ],
  [
    { href: '/admin/solicitudes', label: 'Solicitudes', exact: false, Icon: Users, countKey: 'solicitudes' },
  ],
  [
    { href: '/admin/negocios',       label: 'Negocios',         exact: false, Icon: Building2, countKey: 'negocios' },
    { href: '/admin/categorias',     label: 'Categorías',       exact: false, Icon: Tag },
    { href: '/admin/tipos-servicio', label: 'Tipos de servicio', exact: false, Icon: Layers },
  ],
  [
    { href: '/admin/lugares',     label: 'Lugares',     exact: false, Icon: TreePine },
    { href: '/admin/paquetes',    label: 'Paquetes',    exact: false, Icon: Package, countKey: 'paquetesSolicitudes' },
    { href: '/admin/transportes', label: 'Transportes', exact: false, Icon: Car },
  ],
  [
    { href: '/admin/guias',          label: 'Guías',          exact: false, Icon: Compass },
    { href: '/admin/transportistas', label: 'Transportistas', exact: false, Icon: IdCard },
  ],
  [
    { href: '/admin/comisiones', label: 'Comisiones', exact: false, Icon: Percent },
    { href: '/admin/reembolsos', label: 'Reembolsos', exact: false, Icon: Undo2, countKey: 'reembolsos' },
  ],
]
