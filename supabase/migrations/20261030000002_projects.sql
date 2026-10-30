-- =====================================================================
-- Main projects dashboard: projects, payments, budget, accounting, bank,
-- custody, fleet, documents, residencies, executive summary.
-- Projects & payments: one row per item, version checks, tombstones,
-- DB-assigned receipt numbers, duplicate prevention.
-- =====================================================================

create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  client          text,
  sector          text,
  project_manager text,
  contract_value  numeric(14,2) not null default 0,
  received        numeric(14,2) not null default 0,   -- kept in sync from payments
  progress        numeric(5,2) not null default 0 check (progress between 0 and 100),
  status          text not null default 'active',
  start_date      date,
  end_date        date,
  notes           text,
  version         int not null default 1,
  deleted_at      timestamptz,
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
-- Duplicate prevention (case/space-insensitive, per client).
create unique index projects_name_uq on public.projects
  (lower(btrim(name)), lower(btrim(coalesce(client, '')))) where deleted_at is null;

create sequence public.receipt_no_seq start 1001;

create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  receipt_no  bigint not null unique,
  project_id  uuid not null references public.projects(id),
  amount      numeric(14,2) not null check (amount > 0),
  paid_on     date not null default current_date,
  method      text,
  reference   text,
  payer       text,
  notes       text,
  version     int not null default 1,
  deleted_at  timestamptz,
  created_by  uuid,
  updated_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- Guard against double submits of the same payment.
create unique index payments_dup_uq on public.payments
  (project_id, paid_on, amount, coalesce(reference, '')) where deleted_at is null;

create or replace function app.assign_receipt()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.receipt_no := nextval('public.receipt_no_seq');
  elsif new.receipt_no is distinct from old.receipt_no then
    raise exception 'FORBIDDEN: receipt numbers are assigned by the database';
  end if;
  return new;
end $$;

create or replace function app.sync_project_received()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pid uuid := coalesce(new.project_id, old.project_id);
begin
  -- system-maintained figure: skip the client version check for this update
  perform set_config('app.system_update', 'on', true);
  update public.projects
     set received = coalesce((select sum(amount) from public.payments
                               where project_id = v_pid and deleted_at is null), 0)
   where id = v_pid;
  perform set_config('app.system_update', 'off', true);
  return null;
end $$;

create trigger projects_versioned before insert or update on public.projects
  for each row execute function app.versioned();
create trigger payments_versioned before insert or update on public.payments
  for each row execute function app.versioned();
create trigger payments_receipt before insert or update on public.payments
  for each row execute function app.assign_receipt();
create trigger payments_sync after insert or update or delete on public.payments
  for each row execute function app.sync_project_received();
select app.track('public.projects');
select app.track('public.payments');

-- ---------------------------------------------------------------------
create table public.budget_items (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references public.projects(id),
  period      date,
  category    text not null,
  description text,
  planned     numeric(14,2) not null default 0,
  actual      numeric(14,2) not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.accounting_entries (
  id          uuid primary key default gen_random_uuid(),
  entry_date  date not null default current_date,
  account     text not null,
  description text,
  project_id  uuid references public.projects(id),
  reference   text,
  debit       numeric(14,2) not null default 0,
  credit      numeric(14,2) not null default 0,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.bank_accounts (
  id                uuid primary key default gen_random_uuid(),
  bank_name         text not null,
  account_name      text,
  iban              text unique,
  currency          text not null default 'SAR',
  balance           numeric(14,2) not null default 0,
  last_refreshed_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.bank_transactions (
  id              uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  external_id     text,
  tx_date         date not null,
  description     text,
  amount          numeric(14,2) not null,
  balance_after   numeric(14,2),
  created_at      timestamptz not null default now(),
  unique (bank_account_id, external_id)
);

create table public.custody_items (       -- العهد
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id),
  holder_name text,
  item        text not null,
  description text,
  amount      numeric(14,2) not null default 0,
  issued_on   date not null default current_date,
  returned_on date,
  status      text not null default 'open',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.vehicles (            -- السيارات
  id                  uuid primary key default gen_random_uuid(),
  plate_no            text not null unique,
  make                text,
  model               text,
  year                int,
  driver_employee_id  uuid references public.employees(id),
  registration_expiry date,
  insurance_expiry    date,
  inspection_expiry   date,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.company_documents (   -- الوثائق
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  doc_type    text,
  number      text,
  issue_date  date,
  expiry_date date,
  file_path   text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.residencies (         -- الإقامات
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid references public.employees(id),
  holder_name     text,
  iqama_no        text unique,
  issue_date      date,
  expiry_date     date,
  passport_no     text,
  passport_expiry date,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['budget_items','accounting_entries','bank_accounts','custody_items',
                           'vehicles','company_documents','residencies'] loop
    execute format('create trigger %1$s_touch before update on public.%1$s for each row execute function app.touch()', t);
    perform app.track(('public.' || t)::regclass);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Periodic reports: projects whose dates overlap the period. Figures are
-- the current cumulative snapshot (not period deltas).
-- ---------------------------------------------------------------------
create or replace function public.projects_in_period(p_from date, p_to date)
returns setof public.projects
language sql stable security invoker as $$
  select * from public.projects
   where deleted_at is null
     and coalesce(start_date, '-infinity'::date) <= p_to
     and coalesce(end_date, 'infinity'::date) >= p_from
   order by name
$$;
grant execute on function public.projects_in_period(date, date) to authenticated;

-- Live executive summary (security invoker → caller's RLS applies).
create or replace view public.exec_summary with (security_invoker = true) as
select
  (select count(*) from public.projects where deleted_at is null)                               as projects_count,
  (select count(*) from public.projects where deleted_at is null and status = 'active')         as active_count,
  (select coalesce(sum(contract_value), 0) from public.projects where deleted_at is null)       as contract_total,
  (select coalesce(sum(received), 0) from public.projects where deleted_at is null)             as received_total,
  (select coalesce(avg(progress), 0) from public.projects where deleted_at is null)             as avg_progress,
  (select coalesce(sum(planned), 0) from public.budget_items)                                   as budget_planned,
  (select coalesce(sum(actual), 0) from public.budget_items)                                    as budget_actual,
  (select coalesce(sum(amount), 0) from public.payments
    where deleted_at is null and paid_on >= date_trunc('month', current_date))                  as payments_this_month;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.projects           enable row level security;
alter table public.payments           enable row level security;
alter table public.budget_items       enable row level security;
alter table public.accounting_entries enable row level security;
alter table public.bank_accounts      enable row level security;
alter table public.bank_transactions  enable row level security;
alter table public.custody_items      enable row level security;
alter table public.vehicles           enable row level security;
alter table public.company_documents  enable row level security;
alter table public.residencies        enable row level security;

-- Projects / payments: read via module, insert/update via write; no DELETE
-- policy at all — deletion is a tombstone (deleted_at) set through UPDATE.
create policy projects_read on public.projects for select to authenticated
  using ((select app.can('projects')) or (select app.can('exec_summary')) or (select app.can('project_reports')));
create policy projects_insert on public.projects for insert to authenticated
  with check ((select app.can('projects', true)));
create policy projects_update on public.projects for update to authenticated
  using ((select app.can('projects', true))) with check ((select app.can('projects', true)));

create policy payments_read on public.payments for select to authenticated
  using ((select app.can('payments')) or (select app.can('exec_summary')));
create policy payments_insert on public.payments for insert to authenticated
  with check ((select app.can('payments', true)));
create policy payments_update on public.payments for update to authenticated
  using ((select app.can('payments', true))) with check ((select app.can('payments', true)));

create policy budget_read on public.budget_items for select to authenticated
  using ((select app.can('budget')) or (select app.can('exec_summary')));
create policy budget_write on public.budget_items for all to authenticated
  using ((select app.can('budget', true))) with check ((select app.can('budget', true)));

create policy acct_read on public.accounting_entries for select to authenticated using ((select app.can('accounting')));
create policy acct_write on public.accounting_entries for all to authenticated
  using ((select app.can('accounting', true))) with check ((select app.can('accounting', true)));

-- Bank: refresh/write is admin-only (bank write is only granted to admin).
create policy bank_read on public.bank_accounts for select to authenticated using ((select app.can('bank')));
create policy bank_write on public.bank_accounts for all to authenticated
  using ((select app.can('bank', true))) with check ((select app.can('bank', true)));
create policy banktx_read on public.bank_transactions for select to authenticated using ((select app.can('bank')));
create policy banktx_write on public.bank_transactions for all to authenticated
  using ((select app.can('bank', true))) with check ((select app.can('bank', true)));

create policy custody_read on public.custody_items for select to authenticated using ((select app.can('custody')));
create policy custody_write on public.custody_items for all to authenticated
  using ((select app.can('custody', true))) with check ((select app.can('custody', true)));

create policy fleet_read on public.vehicles for select to authenticated using ((select app.can('fleet')));
create policy fleet_write on public.vehicles for all to authenticated
  using ((select app.can('fleet', true))) with check ((select app.can('fleet', true)));

create policy docs_read on public.company_documents for select to authenticated using ((select app.can('documents')));
create policy docs_write on public.company_documents for all to authenticated
  using ((select app.can('documents', true))) with check ((select app.can('documents', true)));

create policy res_read on public.residencies for select to authenticated using ((select app.can('residencies')));
create policy res_write on public.residencies for all to authenticated
  using ((select app.can('residencies', true))) with check ((select app.can('residencies', true)));

alter publication supabase_realtime add table public.projects, public.payments, public.budget_items;
