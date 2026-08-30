import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { guidesCopy } from '@/lib/copy/guides'
import EditGuideProfileForm from '@/components/mi-perfil-guia/EditGuideProfileForm'
import GuidePayoutAccountForm from '@/components/mi-perfil-guia/GuidePayoutAccountForm'

export default async function EditGuideProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: guide } = await supabase
    .from('tourist_guides')
    .select('id, phone, bio, specialties, languages, rnt_number, tarjeta_profesional_number, verification_status')
    .eq('profile_id', user.id)
    .single()

  if (!guide) redirect('/mi-perfil-guia')

  const { data: payoutAccount } = await supabase
    .from('tourist_guide_payout_accounts')
    .select('bank_name, account_type, account_number, holder_id_type, holder_id_number, holder_name, holder_email')
    .eq('guide_id', guide.id)
    .maybeSingle()

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-6">
        <h1 className="text-xl font-bold text-foreground">{guidesCopy.editProfile.pageTitle}</h1>

        <div className="rounded-2xl border border-border bg-card shadow-sm p-5">
          <EditGuideProfileForm
            phone={guide.phone ?? ''}
            bio={guide.bio ?? null}
            specialties={(guide.specialties as string[]) ?? []}
            languages={(guide.languages as string[]) ?? []}
            rntNumber={guide.rnt_number}
            tarjetaProfesionalNumber={guide.tarjeta_profesional_number}
            verificationStatus={guide.verification_status}
          />
        </div>

        <GuidePayoutAccountForm
          defaultValues={
            payoutAccount
              ? {
                  bankName: payoutAccount.bank_name,
                  accountType: payoutAccount.account_type,
                  accountNumber: payoutAccount.account_number,
                  holderIdType: payoutAccount.holder_id_type,
                  holderIdNumber: payoutAccount.holder_id_number,
                  holderName: payoutAccount.holder_name,
                  holderEmail: payoutAccount.holder_email,
                }
              : null
          }
        />
      </div>
    </main>
  )
}
