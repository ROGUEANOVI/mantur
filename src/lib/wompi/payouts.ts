// Wompi Payouts (Pagos a Terceros) — sends a business/guide their net share
// (amount minus commission) once a booking's payment is confirmed. This is a
// separate product from the Web Checkout in checkout.ts, with its own
// credentials and its own host.
//
// IMPORTANT — before this can send a real payout, WOMPI_PAYOUTS_BASE_URL and
// each recipient's wompi_bank_id/accountId must be confirmed from the
// Wompi merchant dashboard (Desarrollo → Pagos a Terceros). Public Wompi
// documentation does not publish the exact API host, so no default/guessed
// host is hardcoded here — sendProviderPayout() throws a clear, specific
// error instead of silently calling a possibly-wrong endpoint. See
// docs/wompi-alegra-integration-plan.md §4.4 and the migration comment on
// business_payout_accounts.wompi_bank_id.

import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

type PayoutAccountRow = {
  bank_name: string
  wompi_bank_id: string | null
  account_type: 'ahorros' | 'corriente'
  account_number: string
  holder_id_type: 'CC' | 'CE' | 'NIT'
  holder_id_number: string
  holder_name: string
  holder_email: string
}

// Resolves a business/guide's stored bank details into a PayoutRecipient.
// recipient_id on provider_payouts is deliberately not a FK (recipient_type
// picks which table it belongs to, and one column can't reference two
// tables), so this always needs an explicit table/column branch rather than
// a PostgREST embed. Shared by the webhook route's automatic payout attempt
// and the admin retry Server Action — both need the exact same lookup.
export async function resolvePayoutAccount(
  admin: AdminClient,
  recipientType: 'business' | 'guide',
  recipientId: string,
): Promise<PayoutRecipient | null> {
  const table = recipientType === 'business' ? 'business_payout_accounts' : 'tourist_guide_payout_accounts'
  const idColumn = recipientType === 'business' ? 'business_id' : 'guide_id'

  const { data: account } = await admin
    .from(table)
    .select('bank_name, wompi_bank_id, account_type, account_number, holder_id_type, holder_id_number, holder_name, holder_email')
    .eq(idColumn, recipientId)
    .maybeSingle<PayoutAccountRow>()

  if (!account) return null

  return {
    legalIdType: account.holder_id_type,
    legalId: account.holder_id_number,
    wompiBankId: account.wompi_bank_id ?? '',
    accountType: account.account_type,
    accountNumber: account.account_number,
    name: account.holder_name,
    email: account.holder_email,
  }
}

export type PayoutRecipient = {
  legalIdType: 'CC' | 'CE' | 'NIT'
  legalId: string
  wompiBankId: string
  accountType: 'ahorros' | 'corriente'
  accountNumber: string
  name: string
  email: string
}

export type SendProviderPayoutResult =
  | { ok: true; wompiPayoutId: string }
  | { ok: false; error: string }

function requireEnv(
  name: 'WOMPI_PAYOUTS_BASE_URL' | 'WOMPI_PAYOUTS_API_KEY' | 'WOMPI_PAYOUTS_USER_PRINCIPAL_ID' | 'WOMPI_PAYOUTS_ACCOUNT_ID',
): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

// amount_in_cents (what the tourist paid) minus commission_amount_cents
// (ManTur's cut, already computed and stored at booking time) — the net
// amount owed to the business/guide.
export function computeNetPayoutAmountCents(amountInCents: number, commissionAmountCents: number): number {
  return amountInCents - commissionAmountCents
}

// Sends a single one-to-one payout via Wompi's Third-Party Payments API
// (POST /payouts). Field names match Wompi's published request schema:
// legalIdType, legalId, bankId, accountType, accountNumber, name, email,
// amount, reference, accountId, paymentType.
//
// `idempotencyKey` should be the provider_payouts row id (stable across
// retries of the same payout attempt) so a retried call never double-pays
// the recipient — Wompi's own docs confirm the Payouts API supports an
// Idempotency-Key header for this purpose.
export async function sendProviderPayout(params: {
  idempotencyKey: string
  amountCents: number
  recipient: PayoutRecipient
}): Promise<SendProviderPayoutResult> {
  try {
    const baseUrl = requireEnv('WOMPI_PAYOUTS_BASE_URL')
    const apiKey = requireEnv('WOMPI_PAYOUTS_API_KEY')
    const userPrincipalId = requireEnv('WOMPI_PAYOUTS_USER_PRINCIPAL_ID')
    const accountId = requireEnv('WOMPI_PAYOUTS_ACCOUNT_ID')

    if (!params.recipient.wompiBankId) {
      return { ok: false, error: 'recipient has no wompi_bank_id configured' }
    }

    const response = await fetch(`${baseUrl}/payouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'user-principal-id': userPrincipalId,
        'idempotency-key': params.idempotencyKey,
      },
      body: JSON.stringify({
        legalIdType: params.recipient.legalIdType,
        legalId: params.recipient.legalId,
        bankId: params.recipient.wompiBankId,
        accountType: params.recipient.accountType.toUpperCase(),
        accountNumber: params.recipient.accountNumber,
        name: params.recipient.name,
        email: params.recipient.email,
        amount: params.amountCents,
        reference: `payout-${params.idempotencyKey}`,
        accountId,
        paymentType: 'PROVIDERS',
      }),
    })

    const body = await response.json().catch(() => null)

    if (!response.ok) {
      return { ok: false, error: `Wompi Payouts API returned ${response.status}: ${JSON.stringify(body)}` }
    }

    const wompiPayoutId = body?.id ?? body?.data?.id
    if (!wompiPayoutId) {
      return { ok: false, error: `Wompi Payouts API response missing an id: ${JSON.stringify(body)}` }
    }

    return { ok: true, wompiPayoutId: String(wompiPayoutId) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
