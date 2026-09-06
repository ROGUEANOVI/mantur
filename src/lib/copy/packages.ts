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
  },

  reviews: {
    noReviewsYet: 'Aún no tiene reseñas.',
    reviewCount: (n: number) => (n === 1 ? '1 reseña' : `${n} reseñas`),
    itemNoReviewsYet: 'Sin calificar',
    itemReviewCount: (n: number) => (n === 1 ? '1' : `${n}`),
  },
} as const
