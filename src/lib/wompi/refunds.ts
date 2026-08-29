// Wompi transaction void — reverses a card charge before settlement,
// same-day only. Confirmed from Wompi's public docs (unlike the Payouts
// host in payouts.ts, which is not published): POST
// {WOMPI_API_BASE_URL}/transactions/{id}/void, Authorization: Bearer
// {WOMPI_PRIVATE_KEY}. Sandbox and production use different hosts
// (https://sandbox.wompi.co/v1 and https://production.wompi.co/v1), so
// WOMPI_API_BASE_URL is required with no hardcoded default — this must
// never silently call the wrong environment.
//
// Voiding only reverses the ENTIRE original charge — there is no partial
// void. A refund_percentage below 100% (or a charge from an earlier day,
// past the void window) always falls back to a manual admin-initiated bank
// transfer instead of calling this function. See
// docs/wompi-alegra-integration-plan.md §5.2.

export type VoidWompiTransactionResult = { ok: true } | { ok: false; error: string }

function requireEnv(name: 'WOMPI_API_BASE_URL' | 'WOMPI_PRIVATE_KEY'): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

export async function voidWompiTransaction(wompiTransactionId: string): Promise<VoidWompiTransactionResult> {
  try {
    const baseUrl = requireEnv('WOMPI_API_BASE_URL')
    const privateKey = requireEnv('WOMPI_PRIVATE_KEY')

    const response = await fetch(`${baseUrl}/transactions/${encodeURIComponent(wompiTransactionId)}/void`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${privateKey}` },
    })

    const body = await response.json().catch(() => null)

    if (!response.ok) {
      return { ok: false, error: `Wompi void returned ${response.status}: ${JSON.stringify(body)}` }
    }

    const status = body?.data?.status
    if (status !== 'VOIDED') {
      return { ok: false, error: `Wompi void did not return VOIDED status: ${JSON.stringify(body)}` }
    }

    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
