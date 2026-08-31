-- Vendor master list, built from the Freshdesk archive (Jan 2024 - Aug 2026).
-- ~21,800 rows, ~10 MB. Invoice files live in the `vendor-invoices` storage
-- bucket; this table stores their paths.
--
-- Numbered 0182: 0179 (Elaya brain switch) and 0180 (shop product enquiries)
-- are taken and applied on prod, 0181 is the clients spine. Supabase matches on
-- the version number, so a file reusing a taken number is SILENTLY SKIPPED.
--
-- NOT APPLIED. Run through the normal deployment process, never directly
-- against production.

-- Repo convention (0098/0110/0166): extensions live in `extensions`, not public.
-- 0098 already installed pg_trgm there, so this is a no-op on prod; the schema
-- pin keeps a fresh database identical to prod.
create extension if not exists pg_trgm with schema extensions;

create table public.vendors (
  -- uuid, not bigint: Sia 0169 already reserved `vendor_id uuid` on
  -- sia.wag_groups and sia.wag_contacts for this table, and 43 of 46 tables
  -- here use `id uuid`. A bigint key could never satisfy those hooks.
  id                 uuid        primary key default gen_random_uuid(),

  vendor_name        text        not null,

  -- What the vendor SELLS. Distinct from the ticket types it has served.
  vendor_category    text,
  vendor_subcategory text,

  -- Which request types it has been used for, WITH the count for each.
  -- The counts are the point: ranking on the global times_used floats every
  -- high-volume vendor to the top of every category. Travibes has 664 uses but
  -- only 4 are "Retail > General" - without per-category counts it outranks
  -- Amazon's 367 in a retail lookup.
  --   [{"category":"Dining","count":60}, ...]
  ticket_categories  jsonb       not null default '[]'::jsonb,

  -- Cities served, with per-city counts, so a city lookup can rank too.
  --   [{"city":"Delhi","count":34}, ...]
  service_cities     jsonb       not null default '[]'::jsonb,

  -- One entry per person, each holding their own numbers. A null name is
  -- deliberate: those are the vendor's general lines, never tied to a person.
  -- Inventing a name for them would be a lie; dropping them loses the number.
  --   [{"name":"Abdul","phones":["+91 70458 29809"],"emails":[]},
  --    {"name":null,"phones":["9654106784"],"emails":["support@..."]}]
  contacts           jsonb       not null default '[]'::jsonb,

  times_used         integer     not null default 0 check (times_used >= 0),
  first_used         timestamptz,
  last_used          timestamptz,

  -- Ranked agents with their own counts.  [{"agent":"Ria Pujhari","count":52}]
  agents             jsonb       not null default '[]'::jsonb,

  -- Last 5 invoices, newest first. storage_path points into the
  -- vendor-invoices bucket. The path is keyed on attachment_id alone, which is
  -- globally unique: keying it on the vendor id would tie every upload to a
  -- row that must exist first, and the attachment is the natural identity anyway.
  -- (Left flat deliberately - see the bucket migration 0183.) It would mean
  -- uploaded until after the rows were inserted and their ids assigned.
  -- attachment_id exceeds int4 (values reach 1.07e12), hence jsonb not integer.
  --   [{"ticket_id":51860,"attachment_id":1070049291938,
  --     "doc_date":"2026-08-24","storage_path":"1070049291938.pdf"}]
  invoices           jsonb       not null default '[]'::jsonb,
  -- TOTAL invoices ever seen; `invoices` above holds only the newest 5.
  invoice_count      integer     not null default 0 check (invoice_count >= 0),

  -- Spelling variants seen in tickets, so a search for "Shamsher" still finds
  -- LuxDrovia after the two were merged.
  aliases            text[]      not null default '{}',

  category_source    text        check (category_source in ('hand','rule','ticket-category')),

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- Every jsonb payload above is an ARRAY of objects. Rows arrive over the REST
  -- API from an external loader, so assert the shape here (0023 precedent,
  -- tasks.attachments): a scalar or bare object would not raise, it would just
  -- make every ranking query silently match nothing.
  constraint vendors_ticket_categories_is_array check (jsonb_typeof(ticket_categories) = 'array'),
  constraint vendors_service_cities_is_array    check (jsonb_typeof(service_cities)    = 'array'),
  constraint vendors_contacts_is_array          check (jsonb_typeof(contacts)          = 'array'),
  constraint vendors_agents_is_array            check (jsonb_typeof(agents)            = 'array'),
  constraint vendors_invoices_is_array          check (jsonb_typeof(invoices)          = 'array')
);

comment on table public.vendors is
  'Vendor master list from the Freshdesk archive. One row per vendor.';
comment on column public.vendors.ticket_categories is
  'Request types served, with per-category counts - rank lookups on these, not times_used.';
comment on column public.vendors.contacts is
  'Per-person contacts; a null name holds the vendor general lines not tied to anyone.';

-- Lookups: "who do we use for Dining, in Delhi", ranked.
create index vendors_ticket_categories_idx on public.vendors using gin (ticket_categories jsonb_path_ops);
create index vendors_service_cities_idx    on public.vendors using gin (service_cities    jsonb_path_ops);
create index vendors_category_idx          on public.vendors (vendor_category, times_used desc);
create index vendors_times_used_idx        on public.vendors (times_used desc);
-- Opclass schema-qualified: pg_trgm lives in `extensions`, which is not on the
-- search_path in every context (0098 does exactly this for idx_leads_search_trgm).
create index vendors_name_trgm_idx         on public.vendors using gin (vendor_name extensions.gin_trgm_ops);
create index vendors_aliases_idx           on public.vendors using gin (aliases);

-- Reuse the shared helper from migration 0001 (rule: never recreate it).
create trigger vendors_updated_at
  before update on public.vendors
  for each row execute function update_updated_at();

-- RLS on. Reads are open to every signed-in user: this is a lookup library the
-- concierge floor queries constantly - the same posture as service_cases (0110)
-- and elaya_training_assets (0150). Writes have NO policy at all, so they are
-- service-role only (the deals / subscriptions posture): the bulk load and any
-- later edit go through the admin client.
alter table public.vendors enable row level security;

create policy vendors_read_authenticated on public.vendors
  for select to authenticated using (true);

-- Wire the soft hooks Sia 0169 reserved for this table, the same way 0181 did
-- for clients. ON DELETE SET NULL: losing a vendor row must never delete the
-- WhatsApp group or contact that pointed at it.
alter table sia.wag_groups
  add constraint wag_groups_vendor_fk
  foreign key (vendor_id) references public.vendors(id) on delete set null;

alter table sia.wag_contacts
  add constraint wag_contacts_vendor_fk
  foreign key (vendor_id) references public.vendors(id) on delete set null;
