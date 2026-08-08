import type { MetadataRoute } from 'next'

const APP_URL = 'https://mantur.co'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/admin/',
        '/mi-negocio',
        '/mi-negocio/',
        '/mi-perfil',
        '/mi-perfil/',
        '/mi-perfil-guia',
        '/mi-perfil-guia/',
        '/mi-perfil-transporte',
        '/mi-perfil-transporte/',
        '/mis-reservas',
        '/mis-viajes',
        '/reservas',
        '/reservas/',
        '/solicitar-rol',
        '/transporte',
        '/transporte/',
      ],
    },
    sitemap: `${APP_URL}/sitemap.xml`,
  }
}
