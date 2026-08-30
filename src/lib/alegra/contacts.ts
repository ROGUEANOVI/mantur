import { alegraRequest } from './client'

// Wompi's checkout collects a legal ID (billing_data.legal_id_type/legal_id)
// for every card payment, per Colombian card-processing regulation — this is
// the only source we use for a tourist's identification, since ManTur never
// asks for one directly (see the migration comment on
// profile_contact_details.alegra_contact_id for why no document field was
// added to our own schema).
//
// TRUST NOTE: Wompi's webhook checksum only covers `signature.properties`
// (id/status/amount_in_cents), NOT billing_data — so a party that can
// replay/tamper the surrounding JSON without breaking the checksum could in
// theory alter this identification value. The blast radius is deliberately
// narrow: it only affects which name/ID appears on ManTur's own accounting
// invoice for an already-confirmed, already-paid transaction — never a
// financial or access-control decision. Worst case is a wrong invoice buyer
// needing manual correction, not a security or money-integrity issue.
export type AlegraContactResult = { ok: true; contactId: string } | { ok: false; error: string }

type AlegraContact = { id: string | number; identification?: string }

// An individual tourist paying via Wompi is always a natural person / final
// consumer for invoicing purposes, so kindOfPerson/regime are fixed rather
// than inferred from anything we know about them.
//
// UNVERIFIED against a real Alegra response (no ALEGRA_TOKEN was available
// while writing this) — both values are a best-effort default for a
// natural-person final consumer, mirroring Alegra's own built-in "Consumidor
// Final" contact: 'PERSON_ENTITY' for kindOfPerson (despite the name, this
// is the enum value Alegra's Colombia contact schema documents for an
// individual/natural person, as opposed to 'LEGAL_ENTITY' for a company) and
// 'SIMPLIFIED_REGIME' for regime. Verify both against the first real API
// call once credentials exist — the same way the Wompi webhook's ambiguous-
// column bug was only caught by a real sandbox test — and fix here if Alegra
// rejects them.
const NATURAL_PERSON_KIND_OF_PERSON = 'PERSON_ENTITY'
const NATURAL_PERSON_REGIME = 'SIMPLIFIED_REGIME'

// Finds an existing Alegra contact by exact identification match, or creates
// one. Idempotent by identification number — safe to call on every booking
// without caching, though callers should still cache the returned id (see
// profile_contact_details.alegra_contact_id) to avoid the extra GET on
// repeat bookings by the same tourist.
export async function findOrCreateContact(params: {
  legalIdType: string
  legalId: string
  name: string
  email: string | null
}): Promise<AlegraContactResult> {
  const search = await alegraRequest<AlegraContact[]>(`/contacts?identification=${encodeURIComponent(params.legalId)}`)

  if (search.ok) {
    // The API docs describe `identification` as a substring filter, not an
    // exact match, so this narrows to the row that actually matches in full
    // before reusing it.
    const exact = search.data.find((c) => c.identification === params.legalId)
    if (exact) return { ok: true, contactId: String(exact.id) }
  }

  const created = await alegraRequest<AlegraContact>('/contacts', {
    method: 'POST',
    body: {
      name: params.name,
      email: params.email ?? undefined,
      identificationObject: {
        number: params.legalId,
        type: params.legalIdType,
      },
      kindOfPerson: NATURAL_PERSON_KIND_OF_PERSON,
      regime: NATURAL_PERSON_REGIME,
    },
  })

  if (!created.ok) return created
  if (!created.data?.id) {
    return { ok: false, error: `Alegra contact response missing an id: ${JSON.stringify(created.data)}` }
  }

  return { ok: true, contactId: String(created.data.id) }
}
