# Current product state

## Operating decision

ManTur is validating demand through WhatsApp and bank-transfer assisted sales.
`mantur.co` is currently a discovery and trust-building catalogue, not the
default transaction channel. This is a deliberate, reversible operational
decision rather than a rollback.

## Active flows

- Public discovery of businesses, places, guides, transporters, and local SEO
  content.
- Account, role-request, business, guide, transporter, admin, favourites,
  compliance, media, and review features.
- Transport request lifecycle: a tourist requests a ride; a transporter accepts
  it, can quote a price, and marks it complete. Transport reviews are eligible
  after `transport_requests.status = 'completed'`.
- ManTur packages: the primary contact is ManTur's WhatsApp, open to every
  visitor without login (since 2026-11-11 — the login-gated pre-reserva was
  too much friction for social-media traffic); closed sales are registered
  manually from the admin panel. The in-app pre-reservation flow stays as a
  secondary path for signed-in tourists and still confirms provider
  availability before charging. Packages lead the home page (admin-curated
  via `is_featured` + `sort_order`). Package reviews are live.
- Manual package sales: admins register WhatsApp deals from
  `/admin/reservas/nueva` (type "Paquete ManTur"), for a registered tourist
  or an account-less guest (`booking_guest_contacts`, admin-only), as paid
  (`confirmed`, with manual payment method/date/receipt on `transactions`)
  or `pending_payment`. Marking a package paid does NOT trigger Wompi
  provider payouts — providers are paid by hand while in manual mode.

## Dormant customer payment paths

- Direct booking and payment for business services.
- Direct booking and payment for guide tours.
- In-platform payment for accepted transport quotes.

Do not add public UI that revives a dormant path unless the task explicitly
changes the operating decision.

## Retained automation that needs care

- Wompi checkout, refunds, payouts, payout webhook confirmation, and daily
  reconciliation are code-complete and deployed. Real production payout-event
  verification is still pending.
- Alegra contact and commission-invoice creation, DIAN polling, and refund
  credit notes are implemented for payment-confirmation flows. Package sales
  are invoiced manually in Alegra while manual operations continue.
- The domain `mantur.co` is connected to Vercel through Cloudflare; Supabase
  Auth redirects include `https://mantur.co/**`.

## Before changing a transactional flow

Confirm the flow's live/dormant status, validate RLS and authorization chains,
keep financial calculations server-side, and preserve the commission snapshot
stored at booking time. Review `docs/architecture.md` and the applicable rule
under `.claude/rules/` first.

