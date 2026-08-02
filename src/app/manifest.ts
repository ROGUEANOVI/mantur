import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ManTur',
    short_name: 'ManTur',
    description: 'Turismo con alma local en Manaure Balcón del Cesar',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a2b1e',
    theme_color: '#0e7a54',
    lang: 'es',
    categories: ['travel', 'lifestyle'],
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Negocios',
        url: '/negocios',
        description: 'Explora negocios locales',
      },
      {
        name: 'Guías',
        url: '/guias',
        description: 'Encuentra guías turísticos',
      },
      {
        name: 'Transportadores',
        url: '/transportistas',
        description: 'Solicita transporte local',
      },
    ],
  }
}
