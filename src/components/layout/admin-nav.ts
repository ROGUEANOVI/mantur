import { LayoutDashboard, Building2, TreePine, Percent, Tag, Layers, Users, Car, type LucideIcon } from 'lucide-react'

export type AdminNavItem = {
  href: string
  label: string
  exact: boolean
  Icon: LucideIcon
}

// Single source of truth for admin nav — desktop sidebar and mobile tab bar
// both render this, grouped, in the same order.
export const ADMIN_NAV_GROUPS: AdminNavItem[][] = [
  [
    { href: '/admin', label: 'Dashboard', exact: true, Icon: LayoutDashboard },
  ],
  [
    { href: '/admin/solicitudes', label: 'Solicitudes', exact: false, Icon: Users },
  ],
  [
    { href: '/admin/negocios',       label: 'Negocios',         exact: false, Icon: Building2 },
    { href: '/admin/categorias',     label: 'Categorías',       exact: false, Icon: Tag },
    { href: '/admin/tipos-servicio', label: 'Tipos de servicio', exact: false, Icon: Layers },
  ],
  [
    { href: '/admin/lugares',     label: 'Lugares',     exact: false, Icon: TreePine },
    { href: '/admin/transportes', label: 'Transportes', exact: false, Icon: Car },
  ],
  [
    { href: '/admin/comisiones', label: 'Comisiones', exact: false, Icon: Percent },
  ],
]
