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
//
// IMPORTANT — confirmed against a real sandbox call: this endpoint's own
// response does NOT synchronously flip the transaction to VOIDED (we
// observed `data.status: "APPROVED"`, the pre-void status, unchanged, on an
// HTTP 200). The real confirmation arrives later via the normal
// transaction.updated webhook, exactly like the original payment
// confirmation — never trust the redirect/response for the payment itself,
// and the same now applies here. `ok: true` therefore only means "Wompi
// accepted the void request"; `status` carries whatever it echoed back so
// the caller can take a synchronous fast path on the rare case it already
// says VOIDED, but must otherwise wait for the webhook.

export type VoidWompiTransactionResult =
  | { ok: true; status: string | undefined }
  | { ok: false; error: string }

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

    // An HTTP-level rejection of the void itself (Wompi echoes an ERROR/
    // DECLINED status rather than accepting the request) is the one case
    // still treated as an immediate failure — anything else (APPROVED
    // unchanged, or VOIDED already) means the request was accepted.
    const status = body?.data?.status as string | undefined
    if (status === 'ERROR' || status === 'DECLINED') {
      return { ok: false, error: `Wompi rejected the void request: ${JSON.stringify(body)}` }
    }

    return { ok: true, status }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
