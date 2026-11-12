# Product

<!-- impeccable:product-schema 1 -->

<!-- Drafted 2026-11-12 from AGENTS.md and docs/current-state.md, approved by
     the founder as the source. Facts only; open decisions are marked. -->

## Platform

web

## Users

- **Tourists** visiting or planning a trip to Manaure Balcón del Cesar
  (Colombia), mostly on a phone, often arriving from social-media links and
  on intermittent mobile connectivity. They want to know what to do, who can
  take them, and how to book without friction.
- **Local providers**: business owners, motocarro transporters and tourist
  guides who list their offer on ManTur.
- **ManTur admins**: the founding team, who curate content, operate ManTur's
  own tour packages and register sales closed over WhatsApp.

## Product Purpose

A mobile-first tourism marketplace for Manaure that connects tourists with
local businesses, guides, transporters and ManTur's own tour packages.
Success today means validated demand: visitors discover Manaure on
`mantur.co` and start a conversation with ManTur on WhatsApp.

## Positioning

"Turismo con alma local": ManTur is the local operator of Manaure itself —
it knows the places, the people and the calendar of the municipality, and
puts together packages with the providers it lists.

## Operating Context

- Manual-sales mode: `mantur.co` is a discovery and trust-building catalogue;
  sales close over WhatsApp and bank transfer and are registered by admins.
- Package contact is ManTur's WhatsApp, open to every visitor without login.
- Transport requests (cash, accept/complete flow) remain live in-app.
- Business-service and guide-tour booking/payment flows are dormant; do not
  revive them in public UI.

## Capabilities and Constraints

- Next.js App Router on Vercel, Supabase (Postgres, Auth, Storage, RLS).
- All user-facing copy is Spanish and lives in `src/lib/copy/`.
- Money and transaction status are server-only; every user/transactional
  table ships RLS in its migration.
- Wompi/Alegra automation exists but is dormant for customer payments.

## Brand Commitments

- Name **ManTur**; always render the mark through the `ManturLogo` component.
- Brand palette: Verde ManTur, Ámbar Caribe, Bosque, Azul Noche, Salvia,
  Niebla (tokens in `src/app/globals.css`).
- Voice: warm, local, direct Spanish ("tú").

## Evidence on Hand

- Real photos of Manaure places and packages in Supabase Storage.
- Real package reviews are live.
- No invented testimonials, prices, visitor counts or partnerships may be
  added; event information must come from what admins publish.

## Product Principles

1. Mobile first, low bandwidth tolerant.
2. WhatsApp is the conversion path while manual mode lasts.
3. Packages are what sells today; they lead the home page.
4. Show Manaure as it is: real places, real people, real dates.
