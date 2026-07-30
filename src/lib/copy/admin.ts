export const adminCopy = {
  nav: {
    dashboard: 'Admin',
    negocios: 'Negocios',
    comisiones: 'Comisiones',
  },

  dashboard: {
    title: 'Panel de administración',
    pendingAlert: 'negocios pendientes de aprobación',
    stats: {
      pendingBusinesses: 'Pendientes',
      activeBusinesses: 'Activos',
      totalBookings: 'Reservas totales',
      commissionRate: 'Comisión experiencias',
    },
    sections: {
      businesses: 'Gestión de negocios',
      businessesDesc: 'Aprobar o rechazar negocios registrados',
      commissions: 'Tasas de comisión',
      commissionsDesc: 'Ajustar el porcentaje cobrado por servicio',
    },
  },

  negocios: {
    title: 'Negocios',
    approve: 'Aprobar',
    reject: 'Rechazar',
    filter: {
      pending: 'Pendientes',
      active: 'Activos',
      rejected: 'Rechazados',
    },
    owner: 'Propietario',
    createdAt: 'Registrado',
    empty: 'No hay negocios en este estado.',
    statusColors: {
      pending:
        'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
      active:
        'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      rejected:
        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      inactive:
        'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    } as Record<string, string>,
    statusLabels: {
      pending: 'Pendiente',
      active: 'Activo',
      rejected: 'Rechazado',
      inactive: 'Inactivo',
    } as Record<string, string>,
  },

  comisiones: {
    title: 'Tasas de comisión',
    subtitle: 'Porcentaje que retiene VayaTur sobre el monto total de cada transacción.',
    serviceType: {
      experience: 'Experiencias',
      transport: 'Transporte',
      business: 'Negocios',
    } as Record<string, string>,
    rateLabel: 'Tasa (%)',
    save: 'Guardar',
    saving: 'Guardando...',
    success: 'Tasa actualizada correctamente.',
    errors: {
      invalidRate: 'La tasa debe ser un número entre 0 y 100.',
      generic: 'Error al guardar. Intenta de nuevo.',
      notFound: 'Configuración no encontrada.',
    },
  },

  errors: {
    unauthorized: 'No autorizado.',
  },
}
