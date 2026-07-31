export const adminCopy = {
  nav: {
    dashboard: 'Admin',
    negocios: 'Negocios',
    lugares: 'Lugares',
    comisiones: 'Comisiones',
  },

  dashboard: {
    title: 'Panel de administración',
    pendingAlert: 'negocios pendientes de aprobación',
    stats: {
      pendingBusinesses: 'Pendientes',
      activeBusinesses: 'Activos',
      totalBookings: 'Reservas totales',
      totalLugares: 'Lugares turísticos',
      commissionRate: 'Comisión experiencias',
    },
    sections: {
      businesses: 'Gestión de negocios',
      businessesDesc: 'Aprobar o rechazar negocios registrados',
      lugares: 'Lugares turísticos',
      lugaresDesc: 'Crear y editar atracciones de Manaure',
      commissions: 'Tasas de comisión',
      commissionsDesc: 'Ajustar el porcentaje cobrado por servicio',
    },
  },

  negocios: {
    title: 'Negocios',
    new: 'Nuevo negocio',
    approve: 'Aprobar',
    reject: 'Rechazar',
    forceDeactivate: 'Desactivar',
    forceActivate: 'Reactivar',
    filter: {
      pending: 'Pendientes',
      active: 'Activos',
      inactive: 'Inactivos',
      rejected: 'Rechazados',
    },
    owner: 'Propietario',
    createdAt: 'Registrado',
    empty: 'No hay negocios en este estado.',
    feature: 'Destacar',
    unfeature: 'Quitar destacado',
    form: {
      title: 'Crear negocio',
      name: 'Nombre del negocio',
      namePlaceholder: 'Ej: Balneario Las Palmeras',
      type: 'Tipo',
      description: 'Descripción',
      descriptionPlaceholder: 'Describe el negocio...',
      address: 'Dirección',
      addressPlaceholder: 'Ej: Calle 5 #10-20, Manaure',
      phone: 'Teléfono',
      phonePlaceholder: 'Ej: 3001234567',
      owner: 'Propietario',
      ownerPlaceholder: '— Selecciona un propietario —',
      ownerEmpty: 'No hay usuarios con rol business_owner registrados.',
      submit: 'Crear negocio',
      submitting: 'Creando...',
      cancel: 'Cancelar',
      backToList: 'Volver a negocios',
      errors: {
        nameRequired: 'El nombre es obligatorio.',
        typeRequired: 'Selecciona un tipo.',
        ownerRequired: 'Selecciona un propietario.',
        generic: 'Error al crear el negocio. Intenta de nuevo.',
      },
    },
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
    subtitle: 'Porcentaje que retiene ManTur sobre el monto total de cada transacción.',
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

  lugares: {
    title: 'Lugares turísticos',
    subtitle: 'Atracciones y puntos de interés de Manaure Balcón del Cesar.',
    new: 'Nuevo lugar',
    edit: 'Editar',
    delete: 'Eliminar',
    empty: 'Aún no hay lugares registrados.',
    form: {
      name: 'Nombre',
      namePlaceholder: 'Ej: Balneario La Danta',
      description: 'Descripción',
      descriptionPlaceholder: 'Describe el lugar...',
      type: 'Tipo',
      lat: 'Latitud',
      latPlaceholder: 'Ej: 11.7808',
      lng: 'Longitud',
      lngPlaceholder: 'Ej: -72.9944',
      submit: 'Guardar lugar',
      submitting: 'Guardando...',
      cancel: 'Cancelar',
      backToList: 'Volver a lugares',
    },
    errors: {
      nameRequired: 'El nombre es obligatorio.',
      typeRequired: 'Selecciona un tipo.',
      invalidCoords: 'Las coordenadas deben ser números válidos.',
      generic: 'Error al guardar. Intenta de nuevo.',
      notFound: 'Lugar no encontrado.',
      deleteError: 'Error al eliminar.',
    },
  },

  errors: {
    unauthorized: 'No autorizado.',
  },
}
