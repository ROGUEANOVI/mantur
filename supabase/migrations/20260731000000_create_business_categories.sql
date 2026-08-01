-- Business categories managed by admin.
-- Decouples category names from hardcoded frontend constants.

create table business_categories (
  id        uuid        primary key default gen_random_uuid(),
  name      text        not null,
  slug      text        not null unique,
  is_active boolean     not null default true,
  sort_order integer    not null default 0,
  created_at timestamptz not null default now()
);

alter table business_categories enable row level security;

-- Public read (active categories only)
create policy "business_categories_select"
  on business_categories for select
  using (is_active = true);

-- Admin write via service_role (createAdminClient bypasses RLS)
-- No additional policy needed; service_role ignores RLS by default.

-- Seed default categories
insert into business_categories (name, slug, sort_order) values
  ('Resort',          'resort',         1),
  ('Restaurante',     'restaurant',     2),
  ('Finca',           'farm',           3),
  ('Picada',          'eatery',         4),
  ('Casa de campo',   'casa_de_campo',  5),
  ('Balneario',       'balneario',      6),
  ('Otro',            'other',          7);
