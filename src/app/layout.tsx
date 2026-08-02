import type { Metadata } from 'next'
import './globals.css'
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0e7a54' },
    { media: '(prefers-color-scheme: dark)', color: '#0a2b1e' },
  ],
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className={cn("font-sans", inter.variable)}>
      <body>{children}</body>
    </html>
  )
}
