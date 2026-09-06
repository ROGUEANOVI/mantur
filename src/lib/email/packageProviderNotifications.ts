import type { createAdminClient } from '@/lib/supabase/admin'
import { resolvePackageProviders, type PackageProvider } from '@/lib/packages/providers'
import {
  sendPackageProvidersConfirmedEmail,
  sendPackageProvidersCancelledEmail,
  sendPackageProvidersPayoutSentEmail,
} from './bookingEmails'

const APP_URL = 'https://mantur.co'

type AdminClient = ReturnType<typeof createAdminClient>

// The tourist-facing pre-reserva flow (admin/paquetes/solicitudes/actions.ts)
// emails the tourist at every stage; the business/guide behind a
// package_item got nothing at any stage until now. Each notifier below
// mirrors the "never throws" posture of every other notifier in this
// codebase (notifyBusinessOfBooking/notifyGuideOfBooking in the Wompi
// webhook, syncAlegraInvoice, etc.) — a notification failure is a side
// effect of an already-committed admin action and must never surface as one.
async function resolveProviderEmail(
  admin: AdminClient,
  provider: Pick<PackageProvider, 'recipientType' | 'recipientId'>,
): Promise<string | null> {
  if (provider.recipientType === 'business') {
    const { data: business } = await admin
      .from('businesses')
      .select('owner_id')
      .eq('id', provider.recipientId)
      .single<{ owner_id: string }>()
    if (!business) return null
    const { data } = await admin.auth.admin.getUserById(business.owner_id)
    return data.user?.email ?? null
  }

  const { data: guide } = await admin
    .from('tourist_guides')
    .select('profile_id')
    .eq('id', provider.recipientId)
    .single<{ profile_id: string }>()
  if (!guide) return null
  const { data } = await admin.auth.admin.getUserById(guide.profile_id)
  return data.user?.email ?? null
}

function panelUrlFor(recipientType: PackageProvider['recipientType']): string {
  return recipientType === 'business' ? `${APP_URL}/mi-negocio` : `${APP_URL}/mi-perfil-guia`
}

async function forEachPackageProvider(
  admin: AdminClient,
  bookingId: string,
  notify: (email: string, provider: PackageProvider) => Promise<void>,
): Promise<void> {
  try {
    const { data: booking } = await admin
      .from('bookings')
      .select('package_id')
      .eq('id', bookingId)
      .single<{ package_id: string | null }>()

    if (!booking?.package_id) return

    const providers = await resolvePackageProviders(admin, booking.package_id)

    for (const provider of providers) {
      // Per-provider try/catch: a package can have multiple providers (e.g.
      // a business + a guide) — one failing to resolve/email must not skip
      // notifying the rest.
      try {
        const email = await resolveProviderEmail(admin, provider)
        if (email) await notify(email, provider)
      } catch (error) {
        console.error('Unexpected error while notifying one package provider', { ...provider, error })
      }
    }
  } catch (error) {
    console.error('Unexpected error while notifying package providers', error)
  }
}

export async function notifyPackageProvidersOfConfirmation(
  admin: AdminClient,
  params: { bookingId: string; packageName: string; bookingDate: string },
): Promise<void> {
  await forEachPackageProvider(admin, params.bookingId, async (email, provider) => {
    await sendPackageProvidersConfirmedEmail(email, {
      packageName: params.packageName,
      bookingDate: params.bookingDate,
      panelUrl: panelUrlFor(provider.recipientType),
    })
  })
}

export async function notifyPackageProvidersOfCancellation(
  admin: AdminClient,
  params: { bookingId: string; packageName: string; bookingDate: string },
): Promise<void> {
  await forEachPackageProvider(admin, params.bookingId, async (email, provider) => {
    await sendPackageProvidersCancelledEmail(email, {
      packageName: params.packageName,
      bookingDate: params.bookingDate,
      panelUrl: panelUrlFor(provider.recipientType),
    })
  })
}

export async function notifyPackageProvidersOfPayout(
  admin: AdminClient,
  params: { bookingId: string; packageName: string; bookingDate: string },
): Promise<void> {
  await forEachPackageProvider(admin, params.bookingId, async (email, provider) => {
    await sendPackageProvidersPayoutSentEmail(email, {
      packageName: params.packageName,
      bookingDate: params.bookingDate,
      amountCents: provider.amountCents,
      panelUrl: panelUrlFor(provider.recipientType),
    })
  })
}
