-- Apparel product development (PLM): seasons, styles, colourways, bills of materials,
-- size specs, samples, fit, approvals, costings, the critical path and production orders.
-- Money is integer cents. FOB prices keep the factory's currency; costings carry the
-- exchange rate into the brand's currency, so a margin can be re-run at any rate.
create schema if not exists plm;

create or replace function plm.touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- One row: the brand's own currency and the GST rate its retail prices include.
create table plm.settings (
  id boolean primary key default true check (id),
  brand_currency text not null default 'NZD' check (brand_currency ~ '^[A-Z]{3}$'),
  gst_pct numeric(5,2) not null default 15 check (gst_pct >= 0 and gst_pct < 50),
  audit_warning_days integer not null default 60 check (audit_warning_days >= 0)
);
insert into plm.settings default values on conflict do nothing;

create table plm.seasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  launch_on date not null,
  status text not null default 'developing' check (status in ('planning','developing','production','launched','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table plm.factories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  country text not null,
  contact text,
  email text,
  speciality text,
  audit_scheme text,
  audit_expires_on date,
  sample_lead_days integer not null default 21 check (sample_lead_days > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table plm.materials (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  kind text not null check (kind in ('fabric','trim','label','packaging')),
  composition text,
  supplier text,
  unit text not null default 'm' check (unit in ('m','yd','pc','set','kg','cone')),
  unit_cost_cents integer check (unit_cost_cents >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  moq numeric(12,2) check (moq >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table plm.styles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  season_id uuid not null references plm.seasons(id),
  category text not null,
  department text not null default 'unisex' check (department in ('womens','mens','unisex','kids')),
  factory_id uuid references plm.factories(id),
  designer text,
  status text not null default 'concept' check (status in ('concept','proto','fit','sales_sample','pre_production','approved','in_production','dropped')),
  retail_cents integer check (retail_cents > 0),
  target_margin_pct numeric(5,2) not null default 65 check (target_margin_pct > 0 and target_margin_pct < 100),
  planned_units integer not null default 0 check (planned_units >= 0),
  size_range text,
  markets text[] not null default '{NZ,AU}',
  fibre_content text,
  care_instructions text,
  care_symbols text,
  origin text,
  childrens_nightwear boolean not null default false,
  nightwear_category integer check (nightwear_category between 1 and 4),
  fire_label text check (fire_label in ('low','high')),
  nightwear_test_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (markets <@ array['NZ','AU']::text[])
);

create table plm.colourways (
  id uuid primary key default gen_random_uuid(),
  style_id uuid not null references plm.styles(id),
  code text not null,
  name text not null,
  status text not null default 'active' check (status in ('active','dropped')),
  created_at timestamptz not null default now(),
  unique (style_id, code)
);

create table plm.bom_lines (
  id uuid primary key default gen_random_uuid(),
  style_id uuid not null references plm.styles(id),
  material_id uuid not null references plm.materials(id),
  placement text not null,
  consumption numeric(10,3) not null check (consumption > 0),
  wastage_pct numeric(5,2) not null default 3 check (wastage_pct >= 0 and wastage_pct < 100),
  created_at timestamptz not null default now(),
  unique (style_id, material_id, placement)
);

-- Points of measure, one row per size: what the tech pack says the garment measures.
create table plm.spec_lines (
  id uuid primary key default gen_random_uuid(),
  style_id uuid not null references plm.styles(id),
  pom_code text not null,
  description text not null,
  size text not null,
  spec_cm numeric(6,1) not null check (spec_cm > 0),
  tolerance_cm numeric(4,1) not null default 1 check (tolerance_cm >= 0),
  unique (style_id, pom_code, size)
);

create table plm.samples (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  style_id uuid not null references plm.styles(id),
  colourway_id uuid references plm.colourways(id),
  factory_id uuid not null references plm.factories(id),
  kind text not null check (kind in ('proto','fit','sales','pp','top')),
  size text,
  requested_on date not null default current_date,
  due_on date not null,
  received_on date,
  status text not null default 'requested' check (status in ('requested','received','approved','rejected','cancelled')),
  decided_on date,
  decided_by text,
  comments text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_on >= requested_on),
  check (received_on is null or received_on >= requested_on),
  check (status in ('requested','cancelled') or received_on is not null),
  check (status not in ('approved','rejected') or decided_on is not null)
);

create table plm.fit_measurements (
  id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references plm.samples(id),
  pom_code text not null,
  measured_cm numeric(6,1) not null check (measured_cm > 0),
  unique (sample_id, pom_code)
);

-- Lab dips, strike-offs and trim approvals: colour and print sign-off before bulk.
create table plm.approvals (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  style_id uuid not null references plm.styles(id),
  colourway_id uuid references plm.colourways(id),
  kind text not null check (kind in ('lab_dip','strike_off','trim','print')),
  submitted_on date not null default current_date,
  due_on date not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','resubmit')),
  decided_on date,
  decided_by text,
  comments text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'pending' or decided_on is not null)
);

create table plm.costings (
  id uuid primary key default gen_random_uuid(),
  style_id uuid not null references plm.styles(id),
  version integer not null check (version > 0),
  factory_id uuid not null references plm.factories(id),
  fob_cents integer not null check (fob_cents > 0),
  fob_currency text not null default 'USD' check (fob_currency ~ '^[A-Z]{3}$'),
  fx_rate numeric(10,4) not null check (fx_rate > 0),
  freight_cents integer not null default 0 check (freight_cents >= 0),
  duty_pct numeric(5,2) not null default 0 check (duty_pct >= 0 and duty_pct < 100),
  quoted_on date not null default current_date,
  status text not null default 'quoted' check (status in ('quoted','agreed','superseded')),
  note text,
  created_at timestamptz not null default now(),
  unique (style_id, version)
);
comment on column plm.costings.fx_rate is 'Brand currency per one unit of the FOB currency, e.g. 1.70 NZD per USD.';
comment on column plm.costings.freight_cents is 'Freight and clearance per unit, already in the brand currency.';

-- The critical path: each step is due a set number of days before the season launches.
create table plm.path_steps (
  code text primary key,
  name text not null,
  days_before_launch integer not null check (days_before_launch >= 0),
  sort integer not null unique
);

create table plm.milestones (
  id uuid primary key default gen_random_uuid(),
  style_id uuid not null references plm.styles(id),
  step_code text not null references plm.path_steps(code),
  done_on date not null,
  done_by text,
  unique (style_id, step_code)
);

create table plm.production_orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  style_id uuid not null references plm.styles(id),
  colourway_id uuid references plm.colourways(id),
  factory_id uuid not null references plm.factories(id),
  units integer not null check (units > 0),
  fob_cents integer not null check (fob_cents > 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  placed_on date,
  ex_factory_on date not null,
  status text not null default 'draft' check (status in ('draft','placed','in_production','shipped','received','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table plm.notes (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('style','sample','factory','approval','order','season')),
  subject_id uuid not null,
  author text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create or replace function plm.notes_append_only() returns trigger language plpgsql as $$
begin raise exception 'Notes are append-only. Add a new note that corrects the earlier one.'; end $$;
create trigger notes_append_only before update or delete on plm.notes
  for each row execute function plm.notes_append_only();

create table plm.import_rows (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  file_name text not null,
  row_number integer not null,
  row_hash text not null,
  target_id uuid,
  imported_at timestamptz not null default now(),
  unique (source, row_hash)
);

create trigger seasons_touch before update on plm.seasons for each row execute function plm.touch();
create trigger factories_touch before update on plm.factories for each row execute function plm.touch();
create trigger materials_touch before update on plm.materials for each row execute function plm.touch();
create trigger styles_touch before update on plm.styles for each row execute function plm.touch();
create trigger samples_touch before update on plm.samples for each row execute function plm.touch();
create trigger approvals_touch before update on plm.approvals for each row execute function plm.touch();
create trigger orders_touch before update on plm.production_orders for each row execute function plm.touch();

-- A sample is made by the style's factory unless someone says otherwise; a colourway belongs to its style.
create or replace function plm.check_colourway() returns trigger language plpgsql as $$
begin
  if new.colourway_id is not null and not exists (select 1 from plm.colourways c where c.id = new.colourway_id and c.style_id = new.style_id) then
    raise exception 'Colourway does not belong to this style';
  end if;
  return new;
end $$;
create trigger samples_colourway before insert or update on plm.samples for each row execute function plm.check_colourway();
create trigger approvals_colourway before insert or update on plm.approvals for each row execute function plm.check_colourway();
create trigger orders_colourway before insert or update on plm.production_orders for each row execute function plm.check_colourway();

insert into plm.path_steps (code, name, days_before_launch, sort) values
  ('brief', 'Design brief signed off', 210, 1),
  ('tech_pack', 'Tech pack sent to factory', 180, 2),
  ('proto', 'Proto sample approved', 150, 3),
  ('fit', 'Fit approved', 120, 4),
  ('colour', 'Lab dips and strike-offs approved', 110, 5),
  ('costing', 'Costing agreed', 100, 6),
  ('po', 'Production order placed', 90, 7),
  ('pp', 'Pre-production sample approved', 60, 8),
  ('ex_factory', 'Bulk ex-factory', 35, 9),
  ('in_store', 'In store', 0, 10)
on conflict (code) do nothing;

alter table plm.settings enable row level security;
alter table plm.seasons enable row level security;
alter table plm.factories enable row level security;
alter table plm.materials enable row level security;
alter table plm.styles enable row level security;
alter table plm.colourways enable row level security;
alter table plm.bom_lines enable row level security;
alter table plm.spec_lines enable row level security;
alter table plm.samples enable row level security;
alter table plm.fit_measurements enable row level security;
alter table plm.approvals enable row level security;
alter table plm.costings enable row level security;
alter table plm.path_steps enable row level security;
alter table plm.milestones enable row level security;
alter table plm.production_orders enable row level security;
alter table plm.notes enable row level security;
alter table plm.import_rows enable row level security;
