import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import EditBusinessForm from '@/components/mi-negocio/EditBusinessForm'
import PayoutAccountForm from '@/components/mi-negocio/PayoutAccountForm'
import MediaManager from '@/components/shared/MediaManager'
import {
  uploadBusinessImage,
  deleteBusinessImage,
  requestBusinessVideoUpload,
  confirmBusinessVideoUpload,
  deleteBusinessVideo,
} from '@/app/(app)/mi-negocio/actions'

export default async function EditarNegocioPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: business }, { data: categoriesData }, { data: linksData }, { data: payoutAccount }] = await Promise.all([
    supabase
      .from('businesses')
      .select('id, name, description, address, phone, images, videos, lat, lng, rnt_number, rnt_status')
      .eq('id', id)
      .eq('owner_id', user!.id)
      .maybeSingle(),
    supabase
      .from('business_categories')
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('business_category_links')
      .select('category_id')
      .eq('business_id', id),
    supabase
      .from('business_payout_accounts')
      .select('bank_name, account_type, account_number, holder_id_type, holder_id_number, holder_name, holder_email')
      .eq('business_id', id)
      .maybeSingle(),
  ])

  if (!business) notFound()

  const categories = (categoriesData ?? []) as { id: string; name: string }[]
  const selectedCategoryIds = (linksData ?? []).map((l) => l.category_id)

  const boundUpload = uploadBusinessImage.bind(null, business.id)
  const boundDelete = deleteBusinessImage.bind(null, business.id)
  const boundRequestVideo = requestBusinessVideoUpload.bind(null, business.id)
  const boundConfirmVideo = confirmBusinessVideoUpload.bind(null, business.id)
  const boundDeleteVideo = deleteBusinessVideo.bind(null, business.id)

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-8">
        <div>
          <Link
            href={`/mi-negocio/${id}`}
            className={cn(
              'inline-flex items-center gap-1.5 mb-6',
              'text-sm font-medium text-primary min-h-11 py-2',
              'hover:underline underline-offset-4',
            )}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            {business.name}
          </Link>

          <h1 className="text-2xl font-bold text-foreground mb-6">Editar negocio</h1>

          <EditBusinessForm
            businessId={business.id}
            defaultValues={{
              name: business.name,
              description: business.description,
              address: business.address,
              phone: business.phone,
              lat: business.lat,
              lng: business.lng,
              rntNumber: business.rnt_number,
              rntStatus: business.rnt_status,
            }}
            categories={categories}
            selectedCategoryIds={selectedCategoryIds}
          />
        </div>

        <div className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Fotos y videos</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              La primera foto es la portada que ven los turistas.
            </p>
          </div>
          <MediaManager
            images={business.images ?? []}
            videos={business.videos ?? []}
            videoBucket="business-videos"
            uploadImageAction={boundUpload}
            deleteImageAction={boundDelete}
            requestVideoUploadAction={boundRequestVideo}
            confirmVideoUploadAction={boundConfirmVideo}
            deleteVideoAction={boundDeleteVideo}
          />
        </div>

        <PayoutAccountForm
          businessId={business.id}
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
