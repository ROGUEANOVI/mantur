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
- ManTur packages: the pre-reservation flow confirms provider availability
  before charging the tourist. Package reviews are live.

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

