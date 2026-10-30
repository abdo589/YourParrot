-- =====================================================================
-- Construction project management module (Ali): projects, members,
-- contract, team/org chart, submissions, invoices, planning, reports.
-- Module writers (construction write) see every project; everyone else
-- sees only projects they are a member of, with per-project roles.
-- =====================================================================

create type public.cp_role as enum
  ('admin', 'project_manager', 'site_engineer', 'document_controller', 'planner', 'accountant', 'viewer');

create table public.cp_projects (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  client      text,
  location    text,
  start_date  date,
  end_date    date,
  status      text not null default 'planning' check (status in ('planning', 'active', 'on_hold', 'completed')),
  description text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.cp_projects(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       public.cp_role not null default 'viewer',
  added_at   timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- Helpers ------------------------------------------------------------
create or replace function app.cp_is_module_admin()
returns boolean language sql stable security definer set search_path = public, app as $$
  select app.can('construction', true)
$$;

create or replace function app.cp_member_role(p_project uuid)
returns public.cp_role language sql stable security definer set search_path = public as $$
  select role from public.project_members where project_id = p_project and user_id = auth.uid()
$$;

-- read: module admin or any member
create or replace function app.cp_can_read(p_project uuid)
returns boolean language sql stable security definer set search_path = public, app as $$
  select app.can('construction') and (app.cp_is_module_admin() or app.cp_member_role(p_project) is not null)
$$;

-- write: module admin, project admin/PM, or one of the listed roles
create or replace function app.cp_can_write(p_project uuid, p_roles public.cp_role[] default '{}')
returns boolean language sql stable security definer set search_path = public, app as $$
  select app.can('construction') and (
         app.cp_is_module_admin()
      or app.cp_member_role(p_project) in ('admin', 'project_manager')
      or app.cp_member_role(p_project) = any (p_roles))
$$;

-- Contract -----------------------------------------------------------
create table public.cp_contracts (
  project_id    uuid primary key references public.cp_projects(id) on delete cascade,
  contract_no   text,
  value         numeric(14,2) not null default 0,
  signing_date  date,
  duration_days int,
  consultant    text,
  pmo           text,
  notes         text,
  updated_at    timestamptz not null default now()
);

create table public.cp_files (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.cp_projects(id) on delete cascade,
  category    text not null check (category in ('contract', 'specs', 'tender_drawings', 'submission', 'daily_photo', 'other')),
  ref_id      uuid,                    -- submission / daily report id when relevant
  file_path   text not null,           -- storage: construction/<project_id>/...
  file_name   text,
  uploaded_by uuid default auth.uid(),
  uploaded_at timestamptz not null default now()
);

-- Team / org chart (13 job titles) --------------------------------------
create table public.cp_team (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.cp_projects(id) on delete cascade,
  full_name  text not null,
  job_title  text not null check (job_title in (
    'project_director', 'project_manager', 'construction_manager', 'site_engineer', 'planning_engineer',
    'qaqc_engineer', 'hse_officer', 'document_controller', 'quantity_surveyor', 'mep_engineer',
    'surveyor', 'foreman', 'accountant')),
  manager_id uuid references public.cp_team(id) on delete set null,
  phone      text,
  email      text,
  user_id    uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (manager_id is null or manager_id <> id)
);

-- Submissions (MIR / Submittal / Shop Drawing / WIR / Other) -----------
create table public.submissions (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.cp_projects(id) on delete cascade,
  type         text not null check (type in ('MIR', 'SUBMITTAL', 'SHOP_DRAWING', 'WIR', 'OTHER')),
  seq          int not null,
  rev          int not null default 0,
  ref_no       text not null,
  parent_id    uuid references public.submissions(id),
  title        text not null,
  description  text,
  discipline   text,
  location     text,
  submitted_on date not null default current_date,
  returned_on  date,
  code         text check (code in ('A', 'B', 'C', 'D')),
  superseded   boolean not null default false,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  unique (project_id, type, seq, rev)
);

create or replace function app.submission_numbering()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.submissions; v_code text; v_prefix text;
begin
  if new.parent_id is null then
    perform pg_advisory_xact_lock(hashtext(new.project_id::text || new.type));
    select coalesce(max(seq), 0) + 1 into new.seq
      from public.submissions where project_id = new.project_id and type = new.type;
    new.rev := 0;
  else
    -- "Resubmit": only C/D-coded submissions, creates Rev n+1
    select * into p from public.submissions where id = new.parent_id;
    if p.code not in ('C', 'D') or p.code is null then
      raise exception 'INVALID: only C/D-coded submissions can be resubmitted';
    end if;
    if p.superseded then raise exception 'INVALID: already resubmitted'; end if;
    new.project_id := p.project_id; new.type := p.type; new.seq := p.seq; new.rev := p.rev + 1;
    update public.submissions set superseded = true where id = p.id;
  end if;
  select code into v_code from public.cp_projects where id = new.project_id;
  v_prefix := case new.type when 'SHOP_DRAWING' then 'SD' when 'SUBMITTAL' then 'SUB' else new.type end;
  new.ref_no := v_code || '-' || v_prefix || '-' || lpad(new.seq::text, 3, '0')
                || case when new.rev > 0 then '-Rev' || new.rev else '' end;
  new.code := null; new.returned_on := null;
  return new;
end $$;
create trigger submissions_numbering before insert on public.submissions
  for each row execute function app.submission_numbering();

create or replace function app.submission_guard()
returns trigger language plpgsql as $$
begin
  if new.ref_no <> old.ref_no or new.seq <> old.seq or new.rev <> old.rev or new.type <> old.type
     or new.project_id <> old.project_id then
    raise exception 'FORBIDDEN: reference fields are fixed';
  end if;
  if new.code is not null and old.code is null and new.returned_on is null then
    new.returned_on := current_date;
  end if;
  return new;
end $$;
create trigger submissions_guard before update on public.submissions
  for each row execute function app.submission_guard();

create or replace view public.submissions_view with (security_invoker = true) as
select s.*,
       case when s.code is null then current_date - s.submitted_on end as waiting_days,
       (s.code is null and current_date - s.submitted_on > 7) as is_late
  from public.submissions s;

-- Invoices (المستخلصات) -------------------------------------------------
create table public.cp_invoices (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.cp_projects(id) on delete cascade,
  invoice_no       int not null,
  period_from      date not null,
  period_to        date not null,
  gross_amount     numeric(14,2) not null default 0,   -- maintained from items
  retention_pct    numeric(5,2) not null default 10,
  retention_amount numeric(14,2) generated always as (round(gross_amount * retention_pct / 100, 2)) stored,
  net_amount       numeric(14,2) generated always as (gross_amount - round(gross_amount * retention_pct / 100, 2)) stored,
  status           text not null default 'draft'
                   check (status in ('draft', 'submitted', 'under_review', 'approved', 'paid', 'rejected')),
  submitted_on     date,
  approved_on      date,
  paid_on          date,
  paid_amount      numeric(14,2) not null default 0,
  notes            text,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  unique (project_id, invoice_no),
  check (period_to >= period_from)
);

create table public.cp_invoice_items (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references public.cp_invoices(id) on delete cascade,
  submission_id uuid not null references public.submissions(id),
  description   text,
  amount        numeric(14,2) not null check (amount >= 0),
  unique (invoice_id, submission_id)
);

create table public.cp_invoice_followups (
  id         bigint generated always as identity primary key,
  invoice_id uuid not null references public.cp_invoices(id) on delete cascade,
  note       text not null,
  by_user    uuid default auth.uid(),
  at         timestamptz not null default now()
);

create or replace function app.invoice_numbering()
returns trigger language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtext('inv' || new.project_id::text));
  select coalesce(max(invoice_no), 0) + 1 into new.invoice_no from public.cp_invoices where project_id = new.project_id;
  new.gross_amount := 0;
  return new;
end $$;
create trigger invoices_numbering before insert on public.cp_invoices
  for each row execute function app.invoice_numbering();

create or replace function app.invoice_guard()
returns trigger language plpgsql as $$
begin
  if new.invoice_no <> old.invoice_no then raise exception 'FORBIDDEN: invoice number is fixed'; end if;
  if new.gross_amount <> old.gross_amount and current_setting('app.system_update', true) is distinct from 'on' then
    raise exception 'FORBIDDEN: gross amount is computed from WIR items';
  end if;
  if new.status = 'submitted' and old.status = 'draft' and new.submitted_on is null then new.submitted_on := current_date; end if;
  if new.status = 'approved' and new.approved_on is null then new.approved_on := current_date; end if;
  if new.status = 'paid' and new.paid_on is null then new.paid_on := current_date; end if;
  return new;
end $$;
create trigger invoices_guard before update on public.cp_invoices
  for each row execute function app.invoice_guard();

-- Only A/B-coded WIRs of the same project may be invoiced.
create or replace function app.invoice_item_check()
returns trigger language plpgsql security definer set search_path = public as $$
declare s public.submissions; v_project uuid;
begin
  select * into s from public.submissions where id = new.submission_id;
  select project_id into v_project from public.cp_invoices where id = new.invoice_id;
  if s.type <> 'WIR' or s.code not in ('A', 'B') or s.code is null or s.project_id <> v_project then
    raise exception 'INVALID: only A/B-coded WIRs of this project can be invoiced';
  end if;
  return new;
end $$;
create trigger invoice_items_check before insert or update on public.cp_invoice_items
  for each row execute function app.invoice_item_check();

create or replace function app.invoice_recalc()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_inv uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  perform set_config('app.system_update', 'on', true);
  update public.cp_invoices
     set gross_amount = coalesce((select sum(amount) from public.cp_invoice_items where invoice_id = v_inv), 0)
   where id = v_inv;
  perform set_config('app.system_update', 'off', true);
  return null;
end $$;
create trigger invoice_items_recalc after insert or update or delete on public.cp_invoice_items
  for each row execute function app.invoice_recalc();

create or replace view public.cp_invoices_view with (security_invoker = true) as
select i.*,
       (i.status <> 'paid' and i.submitted_on is not null and current_date - i.submitted_on > 30) as overdue,
       case when i.submitted_on is not null and i.status <> 'paid' then current_date - i.submitted_on end as days_unpaid
  from public.cp_invoices i;

create or replace view public.cp_project_totals with (security_invoker = true) as
select p.id as project_id, p.code, p.name,
       coalesce(c.value, 0) as contract_value,
       coalesce((select sum(gross_amount) from public.cp_invoices i where i.project_id = p.id and i.status <> 'rejected'), 0) as invoiced,
       coalesce((select sum(paid_amount) from public.cp_invoices i where i.project_id = p.id), 0) as paid,
       coalesce(c.value, 0) - coalesce((select sum(paid_amount) from public.cp_invoices i where i.project_id = p.id), 0) as remaining
  from public.cp_projects p left join public.cp_contracts c on c.project_id = p.id;

-- Planning (Gantt) --------------------------------------------------------
create table public.cp_activities (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.cp_projects(id) on delete cascade,
  wbs         text,
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  progress    numeric(5,2) not null default 0 check (progress between 0 and 100),
  owner       text,
  depends_on  uuid[] not null default '{}',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);

-- Daily site reports --------------------------------------------------------
create table public.cp_daily_reports (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.cp_projects(id) on delete cascade,
  report_date date not null default current_date,
  weather     text,
  temperature numeric(4,1),
  labor       jsonb not null default '{}',   -- {"carpenter": 6, "steel_fixer": 10, ...}
  equipment   text,
  work_done   text,
  issues      text,
  photos      text[] not null default '{}',  -- storage paths
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  unique (project_id, report_date)
);

-- Dashboard aggregate (security invoker → only visible projects counted)
create or replace view public.cp_dashboard with (security_invoker = true) as
select
  (select count(*) from public.cp_projects where status = 'active')                       as active_projects,
  (select count(distinct user_id) from public.project_members)                           as members,
  (select count(*) from public.submissions where code is null and not superseded)          as pending_docs,
  (select count(*) from public.submissions where code is null and not superseded and current_date - submitted_on > 7) as late_docs,
  (select count(*) from public.submissions where code = 'A')                             as code_a,
  (select count(*) from public.submissions where code = 'B')                             as code_b,
  (select count(*) from public.submissions where code = 'C')                             as code_c,
  (select count(*) from public.submissions where code = 'D')                             as code_d,
  (select count(*) from public.cp_invoices where status in ('submitted', 'under_review', 'approved')) as pending_invoices,
  (select count(*) from public.cp_invoices where status <> 'paid' and submitted_on is not null and current_date - submitted_on > 30) as late_invoices;

do $$
declare t text;
begin
  foreach t in array array['cp_projects','project_members','cp_contracts','cp_files','cp_team','submissions',
                           'cp_invoices','cp_invoice_items','cp_activities','cp_daily_reports'] loop
    perform app.track(('public.' || t)::regclass);
  end loop;
end $$;
create trigger cp_projects_touch before update on public.cp_projects for each row execute function app.touch();
create trigger cp_contracts_touch before update on public.cp_contracts for each row execute function app.touch();

-- RLS -------------------------------------------------------------------
alter table public.cp_projects           enable row level security;
alter table public.project_members       enable row level security;
alter table public.cp_contracts          enable row level security;
alter table public.cp_files              enable row level security;
alter table public.cp_team               enable row level security;
alter table public.submissions           enable row level security;
alter table public.cp_invoices           enable row level security;
alter table public.cp_invoice_items      enable row level security;
alter table public.cp_invoice_followups  enable row level security;
alter table public.cp_activities         enable row level security;
alter table public.cp_daily_reports      enable row level security;

create policy cpp_read on public.cp_projects for select to authenticated using (app.cp_can_read(id));
create policy cpp_insert on public.cp_projects for insert to authenticated with check ((select app.cp_is_module_admin()));
create policy cpp_update on public.cp_projects for update to authenticated
  using (app.cp_can_write(id)) with check (app.cp_can_write(id));
create policy cpp_delete on public.cp_projects for delete to authenticated using ((select app.cp_is_module_admin()));

create policy pm_read on public.project_members for select to authenticated using (app.cp_can_read(project_id));
create policy pm_write on public.project_members for all to authenticated
  using (app.cp_can_write(project_id)) with check (app.cp_can_write(project_id));

create policy cpc_read on public.cp_contracts for select to authenticated using (app.cp_can_read(project_id));
create policy cpc_write on public.cp_contracts for all to authenticated
  using (app.cp_can_write(project_id)) with check (app.cp_can_write(project_id));

create policy cpf_read on public.cp_files for select to authenticated using (app.cp_can_read(project_id));
create policy cpf_write on public.cp_files for all to authenticated
  using (app.cp_can_write(project_id, '{document_controller,site_engineer}'))
  with check (app.cp_can_write(project_id, '{document_controller,site_engineer}'));

create policy team_read on public.cp_team for select to authenticated using (app.cp_can_read(project_id));
create policy team_write on public.cp_team for all to authenticated
  using (app.cp_can_write(project_id)) with check (app.cp_can_write(project_id));

create policy sub_read on public.submissions for select to authenticated using (app.cp_can_read(project_id));
create policy sub_write on public.submissions for all to authenticated
  using (app.cp_can_write(project_id, '{document_controller}'))
  with check (app.cp_can_write(project_id, '{document_controller}'));

create policy inv_read on public.cp_invoices for select to authenticated using (app.cp_can_read(project_id));
create policy inv_write on public.cp_invoices for all to authenticated
  using (app.cp_can_write(project_id, '{accountant}')) with check (app.cp_can_write(project_id, '{accountant}'));

create policy invi_read on public.cp_invoice_items for select to authenticated
  using (exists (select 1 from public.cp_invoices i where i.id = invoice_id));
create policy invi_write on public.cp_invoice_items for all to authenticated
  using (exists (select 1 from public.cp_invoices i where i.id = invoice_id and app.cp_can_write(i.project_id, '{accountant}')))
  with check (exists (select 1 from public.cp_invoices i where i.id = invoice_id and app.cp_can_write(i.project_id, '{accountant}')));

create policy invf_read on public.cp_invoice_followups for select to authenticated
  using (exists (select 1 from public.cp_invoices i where i.id = invoice_id));
create policy invf_write on public.cp_invoice_followups for insert to authenticated
  with check (exists (select 1 from public.cp_invoices i where i.id = invoice_id and app.cp_can_write(i.project_id, '{accountant}')));

create policy act_read on public.cp_activities for select to authenticated using (app.cp_can_read(project_id));
create policy act_write on public.cp_activities for all to authenticated
  using (app.cp_can_write(project_id, '{planner}')) with check (app.cp_can_write(project_id, '{planner}'));

create policy dr_read on public.cp_daily_reports for select to authenticated using (app.cp_can_read(project_id));
create policy dr_write on public.cp_daily_reports for all to authenticated
  using (app.cp_can_write(project_id, '{site_engineer}')) with check (app.cp_can_write(project_id, '{site_engineer}'));
