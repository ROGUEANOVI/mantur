// Estimates what Wompi actually retains per successful transaction, so
// ManTur can see its real net margin (commission minus this fee) instead of
// treating the gross commission as if it were all profit.
//
// ESTIMATE, not a confirmed value: neither GET /transactions/{id} nor the
// transaction.updated webhook expose any fee/comisión field (confirmed
// against Wompi's own API docs) — the actual per-transaction fee is only
// visible in Wompi's own settlement reports, not through any API this
// codebase can call. This is computed from Wompi's published "Plan de
// facturación" for this merchant, confirmed live in comercios.wompi.co on
// 2026-08-31 (the day the merchant account itself was approved):
// 2.65% + $700 COP + 19% IVA on that fee, per successful transaction.
//
// Only the standard rate is modeled — Wompi's Código QR (1%) and physical
// contactless-via-App-Wompi (1.98% + IVA, no fixed fee) special rates apply
// to Wompi's own point-of-sale/App products, which ManTur's hosted Web
// Checkout redirect never reaches (cards, PSE, Nequi, Daviplata, Botón
// Bancolombia, Compra y Paga Después all fall under the standard rate).
//
// Revisit this formula if Wompi's published rate ever changes — there is no
// way to detect that automatically since Wompi doesn't expose it per
// transaction.
const WOMPI_VARIABLE_RATE = 0.0265
const WOMPI_FIXED_FEE_CENTS = 70_000 // $700 COP, in cents (COP has no real sub-peso unit)
const WOMPI_FEE_IVA_RATE = 0.19

export function estimateWompiFeeCents(amountInCents: number): number {
  const preTaxFee = amountInCents * WOMPI_VARIABLE_RATE + WOMPI_FIXED_FEE_CENTS
  return Math.round(preTaxFee * (1 + WOMPI_FEE_IVA_RATE))
}
