// Shared authenticated request helper for Alegra's main accounting API.
// Authentication: HTTP Basic Auth with the account's own email (ALEGRA_USER)
// as username and its API token (ALEGRA_TOKEN) as password — confirmed from
// Alegra's public docs. Unlike Wompi, Alegra has a single stable host with
// no sandbox/production split, so it's safe to hardcode here.
const ALEGRA_BASE_URL = 'https://api.alegra.com/api/v1'

function requireEnv(name: 'ALEGRA_USER' | 'ALEGRA_TOKEN'): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

export type AlegraResult<T> = { ok: true; data: T } | { ok: false; error: string }

// Bounds the worst case if Alegra's API hangs. Both this call and the
// Wompi Payouts call in the same webhook delivery are awaited before the
// webhook's own HTTP response is sent (see syncAlegraInvoice in
// src/app/api/webhooks/wompi/route.ts) — an unbounded hang here would delay
// that response and risk Wompi's own retry policy kicking in on an already-
// successfully-processed payment. AbortSignal.timeout() turns a hang into a
// normal rejected fetch, which the existing catch below already handles.
const REQUEST_TIMEOUT_MS = 10_000

export async function alegraRequest<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<AlegraResult<T>> {
  try {
    const user = requireEnv('ALEGRA_USER')
    const token = requireEnv('ALEGRA_TOKEN')
    const authHeader = `Basic ${Buffer.from(`${user}:${token}`).toString('base64')}`

    const response = await fetch(`${ALEGRA_BASE_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    const body = await response.json().catch(() => null)

    if (!response.ok) {
      return { ok: false, error: `Alegra API returned ${response.status}: ${JSON.stringify(body)}` }
    }

    return { ok: true, data: body as T }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
