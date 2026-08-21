import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { transportCopy } from '@/lib/copy/transport'
import EditTransporterProfileForm from '@/components/transporte/EditTransporterProfileForm'

export default async function EditTransporterProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: transporter } = await supabase
    .from('transporters')
    .select('transport_tier, verification_status, cooperative_name, cooperative_rnt_number, cooperative_habilitacion_number, driver_license_number, driver_license_expiry, soat_expiry_date')
    .eq('profile_id', user.id)
    .single()

  if (!transporter) redirect('/mi-perfil-transporte')

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-6">
        <h1 className="text-xl font-bold text-foreground">{transportCopy.editProfile.pageTitle}</h1>

        <div className="rounded-2xl border border-border bg-card shadow-sm p-5">
          <EditTransporterProfileForm
            currentTier={transporter.transport_tier}
            verificationStatus={transporter.verification_status}
            cooperativeName={transporter.cooperative_name}
            cooperativeRntNumber={transporter.cooperative_rnt_number}
            cooperativeHabilitacionNumber={transporter.cooperative_habilitacion_number}
            driverLicenseNumber={transporter.driver_license_number}
            driverLicenseExpiry={transporter.driver_license_expiry}
            soatExpiryDate={transporter.soat_expiry_date}
          />
        </div>
      </div>
    </main>
  )
}
