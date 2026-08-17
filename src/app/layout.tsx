import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Inter } from "next/font/google";
import { Toaster } from 'sonner'
import { cn } from "@/lib/utils";
import { jsonLdScriptProps } from '@/lib/seo/jsonLd'
import { MANAURE_CENTER } from '@/lib/geo'

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

const APP_URL = 'https://mantur.co'
const DESCRIPTION =
  'Descubre Manaure Balcón del Cesar. Reserva experiencias en negocios locales, contrata guías turísticos y encuentra transporte con alma local.'

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'ManTur — Turismo con alma local',
    template: '%s | ManTur',
  },
  description: DESCRIPTION,
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
  openGraph: {
    siteName: 'ManTur',
    locale: 'es_CO',
    type: 'website',
    title: 'ManTur — Turismo con alma local',
    description: DESCRIPTION,
    url: APP_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ManTur — Turismo con alma local',
    description: DESCRIPTION,
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0e7a54' },
    { media: '(prefers-color-scheme: dark)', color: '#0a2b1e' },
  ],
}

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'ManTur',
  url: APP_URL,
  logo: `${APP_URL}/icons/512`,
  description: DESCRIPTION,
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Manaure Balcón del Cesar',
    addressRegion: 'Cesar',
    addressCountry: 'CO',
  },
  areaServed: {
    '@type': 'City',
    name: 'Manaure Balcón del Cesar',
    containedInPlace: { '@type': 'AdministrativeArea', name: 'Cesar' },
    geo: { '@type': 'GeoCoordinates', latitude: MANAURE_CENTER[0], longitude: MANAURE_CENTER[1] },
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className={cn("font-sans", inter.variable)}>
      <body>
        <script {...jsonLdScriptProps(organizationJsonLd)} />
        {children}
        <Toaster
          position="top-center"
          theme="system"
          richColors
          toastOptions={{
            classNames: {
              toast: 'font-sans',
            },
          }}
        />
      </body>
    </html>
  )
}
