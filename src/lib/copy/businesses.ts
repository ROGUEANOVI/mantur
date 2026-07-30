export const miNegocioCopy = {
  nav: {
    overview: 'Mi negocio',
    experiences: 'Experiencias',
  },
  setup: {
    title: 'Registra tu negocio',
    subtitle: 'Completa la información para que los turistas puedan encontrarte.',
    submit: 'Crear negocio',
    submitting: 'Creando negocio...',
  },
  overview: {
    title: 'Mi negocio',
    statusLabel: 'Estado',
    statusPending: 'En revisión',
    statusActive: 'Activo',
    statusInactive: 'Inactivo',
    pendingNote: 'Tu negocio está siendo revisado por nuestro equipo. Te notificaremos cuando esté aprobado.',
    editButton: 'Editar información',
    experiencesSubtitle: 'Administra tus actividades y servicios',
  },
  experiences: {
    title: 'Mis experiencias',
    addButton: 'Nueva experiencia',
    newTitle: 'Nueva experiencia',
    backToExperiences: 'Volver a experiencias',
    empty: 'Aún no tienes experiencias. Agrega una para que los turistas puedan reservar.',
    activate: 'Activar',
    deactivate: 'Desactivar',
    toggling: 'Actualizando...',
    statusActive: 'Activa',
    statusInactive: 'Inactiva',
  },
  form: {
    name: 'Nombre',
    namePlaceholder: 'Ej: Tour por el río',
    businessNamePlaceholder: 'Ej: Balneario El Paraíso',
    description: 'Descripción',
    descriptionPlaceholder: 'Describe la experiencia...',
    businessDescriptionPlaceholder: 'Describe tu negocio...',
    type: 'Tipo de negocio',
    address: 'Dirección',
    addressPlaceholder: 'Ej: Calle 5 #10-20, Manaure',
    phone: 'Teléfono de contacto',
    phonePlaceholder: 'Ej: 3001234567',
    price: 'Precio por persona (COP)',
    pricePlaceholder: 'Ej: 50000',
    capacity: 'Cupo máximo',
    capacityPlaceholder: 'Ej: 10',
    duration: 'Duración (minutos)',
    durationPlaceholder: 'Ej: 90',
    submit: 'Guardar',
    submitting: 'Guardando...',
    cancel: 'Cancelar',
  },
  errors: {
    generic: 'Ocurrió un error. Intenta de nuevo.',
  },
}

export const businessesCopy = {
  nav: {
    businesses: 'Negocios',
    places: 'Lugares',
    experiences: 'Experiencias',
  },

  businesses: {
    pageTitle: 'Negocios turísticos',
    pageSubtitle: 'Descubre los mejores balnearios, restaurantes y fincas de Manaure',
    empty: 'Próximamente habrá negocios disponibles en Manaure.',
    fromPrice: 'Desde',
    viewDetail: 'Ver detalles',
    types: {
      resort: 'Balneario',
      restaurant: 'Restaurante',
      farm: 'Finca',
      eatery: 'Estadero',
      other: 'Otro',
    } as Record<string, string>,
  },

  places: {
    pageTitle: 'Lugares turísticos',
    pageSubtitle: 'Explora las atracciones naturales y culturales de Manaure Balcón del Cesar',
    empty: 'Próximamente se publicarán los lugares de interés.',
    types: {
      waterfall: 'Cascada',
      river: 'Río',
      viewpoint: 'Mirador',
      beach: 'Playa',
      park: 'Parque',
      other: 'Lugar de interés',
    } as Record<string, string>,
  },

  experiences: {
    sectionTitle: 'Experiencias disponibles',
    empty: 'Este negocio no tiene experiencias disponibles por el momento.',
    book: 'Reservar',
    duration: 'Duración',
    capacity: 'Cupo',
    minutes: 'min',
    people: 'personas',
    price: 'Precio por persona',
  },

  detail: {
    contact: 'Contacto',
    address: 'Dirección',
    back: 'Volver',
  },
}
