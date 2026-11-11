export const packagesCopy = {
  publicPage: {
    pageTitle: 'Paquetes y tours',
    pageSubtitle: 'Experiencias completas organizadas por ManTur en Manaure Balcón del Cesar',
    searchPlaceholder: 'Buscar paquete...',
    empty: 'Próximamente publicaremos nuestros primeros paquetes.',
  },

  detail: {
    capacity: 'Cupo',
    people: 'personas',
    includedTitle: 'Qué incluye',
    back: 'Volver a paquetes',
    whatsappHint: 'Te respondemos por WhatsApp con fechas, cupos y forma de pago. No necesitas cuenta.',
    prereservaDivider: 'O solicítalo en la plataforma',
    peopleLabel: '¿Cuántas personas?',
    peopleDecrease: 'Quitar una persona',
    peopleIncrease: 'Agregar una persona',
    groupPricingHint: 'El valor final depende del tamaño del grupo y la fecha.',
  },

  // One price display for every package surface (home showcase, /paquetes,
  // detail). Always "Desde": several packages are priced per group size, so
  // the stored base_price is the lowest real fare, not a fixed one.
  price: {
    from: 'Desde',
    unit: {
      per_person: 'por persona',
      per_night: 'por noche',
      fixed: 'por grupo',
    } as Record<string, string>,
  },

  // ManTur-mediated WhatsApp contact — open to every visitor, logged in or
  // not (2026-11-11: the login-gated pre-reserva was too much friction for
  // visitors arriving from social media). Closed sales are registered
  // manually from the admin panel.
  // The "(ref: slug)" tag lets ManTur tell which package (and later which
  // campaign) a chat came from when registering the sale.
  whatsapp: {
    cta: 'Consultar por WhatsApp',
    ctaReserve: 'Reservar por WhatsApp',
    message: (packageName: string, slug: string) =>
      `Hola ManTur, quiero información del paquete: ${packageName} (ref: ${slug})`,
    reserveMessage: (packageName: string, slug: string, people: number) =>
      `Hola ManTur, quiero reservar: ${packageName} para ${people} ${people === 1 ? 'persona' : 'personas'} (ref: ${slug})`,
    customMessage: 'Hola, quiero armar un paquete a mi medida en Manaure.',
  },

  // Home page showcase (src/components/paquetes/PackageShowcase.tsx).
  showcase: {
    title: 'Paquetes para vivir Manaure',
    subtitle: 'Experiencias completas organizadas por ManTur en Manaure Balcón del Cesar.',
    viewAll: 'Ver todos los paquetes',
    recommended: 'Recomendado',
    viewDetail: 'Ver paquete',
    capacity: (n: number) => `Hasta ${n} personas`,
    customTitle: '¿Lo quieres a tu medida?',
    customBody: 'Cuéntanos fechas, personas y qué te gustaría vivir. Armamos el plan contigo por WhatsApp.',
    customCta: 'Escríbenos',
  },

  reviews: {
    noReviewsYet: 'Aún no tiene reseñas.',
    reviewCount: (n: number) => (n === 1 ? '1 reseña' : `${n} reseñas`),
    itemNoReviewsYet: 'Sin calificar',
    itemReviewCount: (n: number) => (n === 1 ? '1' : `${n}`),
  },
} as const
