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
    includedEmpty: 'La información de este paquete se está actualizando.',
    back: 'Volver a paquetes',
    whatsappHint: 'Te respondemos por WhatsApp con fechas, cupos y forma de pago. No necesitas cuenta.',
    prereservaDivider: 'O solicítalo en la plataforma',
  },

  // ManTur-mediated WhatsApp contact — open to every visitor, logged in or
  // not (2026-11-11: the login-gated pre-reserva was too much friction for
  // visitors arriving from social media). Closed sales are registered
  // manually from the admin panel.
  whatsapp: {
    cta: 'Consultar por WhatsApp',
    ctaShort: 'WhatsApp',
    message: (packageName: string) => `Hola, quiero más información sobre el paquete "${packageName}".`,
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
    unitSuffix: {
      per_person: 'por persona',
      per_night: 'por noche',
      fixed: 'precio total',
    } as Record<string, string>,
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
