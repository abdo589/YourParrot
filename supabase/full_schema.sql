-- METAL FUZE PROJECTS — full schema (all migrations combined, in order).
-- Paste into Supabase Dashboard → SQL Editor → Run, on an empty project.

-- ===== 20261030000001_core.sql =====
-- =====================================================================
-- METAL FUZE PROJECTS — core: roles, profiles, permissions, audit helpers
-- Every permission is enforced here (RLS), the browser only mirrors it.
-- =====================================================================
create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create schema if not exists app;
grant usage on schema app to authenticated, anon;

create type public.app_role as enum
  ('admin', 'executive', 'hr', 'sales', 'manager', 'developer', 'viewer');

-- ---------------------------------------------------------------------
-- Employees (referenced by profiles; HR-owned, policies in hr migration)
-- ---------------------------------------------------------------------
create table public.employees (
  id                  uuid primary key default gen_random_uuid(),
  employee_no         text unique,
  full_name           text not null,
  full_name_en        text,
  email               text,
  phone               text,
  national_id         text,
  nationality         text,
  job_title           text,
  department          text,
  establishment       text,                 -- المنشأة (for establishment payroll)
  hire_date           date,
  basic_salary        numeric(12,2) not null default 0,
  housing_allowance   numeric(12,2) not null default 0,
  transport_allowance numeric(12,2) not null default 0,
  other_allowance     numeric(12,2) not null default 0,
  annual_leave_days   int not null default 30,
  status              text not null default 'active',
  supervisor_id       uuid references public.employees(id) on delete set null,
  device_user_id      text unique,          -- ZKTeco PIN
  checkin_token       text unique not null default encode(gen_random_bytes(24), 'hex'),
  user_id             uuid unique references auth.users(id) on delete set null,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index employees_email_uq on public.employees (lower(email)) where email is not null;

-- ---------------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------------
create table public.profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  username               text unique,
  email                  text,
  full_name              text,
  full_name_en           text,
  role                   public.app_role not null default 'manager',
  employee_id            uuid unique references public.employees(id) on delete set null,
  can_approve_leaves     boolean not null default false,  -- Aisha + CEO
  can_multi_account      boolean not null default false,  -- Eilaf only
  is_ceo                 boolean not null default false,
  is_supervisor          boolean not null default false,
  is_meeting_responsible boolean not null default false,  -- Haitham / CEO / Eilaf
  suspended              boolean not null default false,
  self_signup            boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Role defaults and per-user overrides. When a user has ANY row in
-- user_permissions those rows replace the role defaults entirely
-- (this is how Ali gets only the construction module + comms).
create table public.role_permissions (
  role      public.app_role not null,
  module    text not null,
  can_write boolean not null default false,
  primary key (role, module)
);

create table public.user_permissions (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  module    text not null,
  can_write boolean not null default false,
  primary key (user_id, module)
);

-- Per-account access rules (hours / IP / device), managed from /dev.
create table public.access_rules (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  hours_from      time,
  hours_to        time,
  allowed_ips     text[] not null default '{}',
  allowed_devices text[] not null default '{}',
  note            text,
  updated_at      timestamptz not null default now()
);

create table public.app_settings (
  key   text primary key,
  value jsonb not null
);

-- ---------------------------------------------------------------------
-- Permission helpers
-- ---------------------------------------------------------------------
create or replace function app.request_header(p_name text)
returns text language sql stable as $$
  select nullif(current_setting('request.headers', true), '')::json ->> p_name
$$;

create or replace function app.access_ok()
returns boolean
language plpgsql stable security definer
set search_path = public, app
as $$
declare
  v_suspended boolean;
  r           public.access_rules;
  v_now       time;
  v_ip        text;
  v_dev       text;
begin
  select suspended into v_suspended from public.profiles where id = auth.uid();
  if v_suspended is null or v_suspended then
    return false;
  end if;

  select * into r from public.access_rules where user_id = auth.uid();
  if not found then
    return true;
  end if;

  if r.hours_from is not null and r.hours_to is not null then
    v_now := (now() at time zone 'Asia/Riyadh')::time;
    if r.hours_from <= r.hours_to then
      if v_now < r.hours_from or v_now > r.hours_to then return false; end if;
    else -- overnight window, e.g. 20:00 → 04:00
      if v_now < r.hours_from and v_now > r.hours_to then return false; end if;
    end if;
  end if;

  if coalesce(array_length(r.allowed_ips, 1), 0) > 0 then
    v_ip := btrim(split_part(coalesce(app.request_header('x-forwarded-for'),
                                      app.request_header('x-real-ip'), ''), ',', 1));
    if not (v_ip = any (r.allowed_ips)) then return false; end if;
  end if;

  if coalesce(array_length(r.allowed_devices, 1), 0) > 0 then
    v_dev := app.request_header('x-device-id');
    if v_dev is null or not (v_dev = any (r.allowed_devices)) then return false; end if;
  end if;

  return true;
end $$;

create or replace function app.can(p_module text, p_write boolean default false)
returns boolean
language plpgsql stable security definer
set search_path = public, app
as $$
declare
  v_role public.app_role;
  v_ok   boolean;
begin
  if auth.uid() is null or not app.access_ok() then
    return false;
  end if;
  if exists (select 1 from public.user_permissions where user_id = auth.uid()) then
    select true into v_ok from public.user_permissions
     where user_id = auth.uid() and module = p_module and (not p_write or can_write);
  else
    select role into v_role from public.profiles where id = auth.uid();
    select true into v_ok from public.role_permissions
     where role = v_role and module = p_module and (not p_write or can_write);
  end if;
  return coalesce(v_ok, false);
end $$;

create or replace function app.my_employee_id()
returns uuid language sql stable security definer set search_path = public as $$
  select employee_id from public.profiles where id = auth.uid()
$$;

create or replace function app.authed()
returns boolean language sql stable as $$
  select auth.uid() is not null and app.access_ok()
$$;

-- Client-callable: the effective permission set for the nav.
create or replace function public.my_permissions()
returns table (module text, can_write boolean)
language sql stable security definer set search_path = public, app as $$
  select up.module, up.can_write from public.user_permissions up
   where up.user_id = auth.uid() and app.access_ok()
  union all
  select rp.module, rp.can_write from public.role_permissions rp
   join public.profiles p on p.role = rp.role and p.id = auth.uid()
   where not exists (select 1 from public.user_permissions where user_id = auth.uid())
     and app.access_ok()
$$;
grant execute on function public.my_permissions() to authenticated;

-- ---------------------------------------------------------------------
-- Generic triggers: updated_at, activity log, versioned rows/tombstones
-- ---------------------------------------------------------------------
create or replace function app.touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create table public.activity_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  user_id    uuid,
  table_name text not null,
  op         text not null,
  row_id     text,
  old_data   jsonb,
  new_data   jsonb
);
create index activity_log_at_idx on public.activity_log (at desc);

create or replace function app.log_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_log (user_id, table_name, op, row_id, old_data, new_data)
  values (auth.uid(), tg_table_name, tg_op,
          coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id', ''),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- Optimistic locking + tombstones: the client sends the version it read;
-- a mismatch means someone else saved first. Deleted rows are frozen.
create or replace function app.versioned()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.deleted_at := null;
    new.created_by := coalesce(new.created_by, auth.uid());
    return new;
  end if;
  if current_setting('app.system_update', true) = 'on' then
    return new;
  end if;
  if old.deleted_at is not null then
    raise exception 'RECORD_DELETED: deleted records cannot be modified or restored' using errcode = 'P0001';
  end if;
  if new.version is distinct from old.version then
    raise exception 'VERSION_CONFLICT: record changed by another user (have %, current %)', new.version, old.version
      using errcode = '40001';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create or replace function app.track(p_table regclass)
returns void language plpgsql as $$
begin
  execute format('create trigger zz_activity after insert or update or delete on %s
                  for each row execute function app.log_activity()', p_table);
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function app.touch();
create trigger employees_touch before update on public.employees for each row execute function app.touch();
select app.track('public.profiles');
select app.track('public.user_permissions');
select app.track('public.access_rules');
select app.track('public.employees');

-- ---------------------------------------------------------------------
-- Profile privilege guard: only account managers change role/flags.
-- ---------------------------------------------------------------------
create or replace function app.guard_profile()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if auth.uid() is null then return new; end if; -- service role / internal
  if not app.can('accounts', true) and (
       new.role is distinct from old.role
    or new.employee_id is distinct from old.employee_id
    or new.can_approve_leaves is distinct from old.can_approve_leaves
    or new.can_multi_account is distinct from old.can_multi_account
    or new.is_ceo is distinct from old.is_ceo
    or new.is_supervisor is distinct from old.is_supervisor
    or new.is_meeting_responsible is distinct from old.is_meeting_responsible
    or new.suspended is distinct from old.suspended
    or new.username is distinct from old.username
    or new.self_signup is distinct from old.self_signup) then
    raise exception 'FORBIDDEN: only account managers can change these fields';
  end if;
  -- Nobody but the developer grants the developer role or multi-account.
  if (new.role = 'developer' and old.role <> 'developer' or new.can_multi_account and not old.can_multi_account)
     and not app.can('dev', true) then
    raise exception 'FORBIDDEN: developer only';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function app.guard_profile();

-- New auth user → profile. Signup metadata is never trusted for privileges:
-- everyone starts as a self-signup manager ("My Projects" only); the
-- admin-users edge function (service role) promotes staff accounts.
create or replace function app.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, username, full_name)
  values (new.id, new.email,
          lower(coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(new.email, '@', 1)))
            || case when exists (select 1 from public.profiles
                                  where username = lower(coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(new.email, '@', 1))))
                    then '-' || substr(new.id::text, 1, 4) else '' end,
          coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  if new.email_confirmed_at is not null then
    perform app.link_employee(new.id, new.email);
  end if;
  return new;
end $$;

-- Employee linking happens only once the email is confirmed.
create or replace function app.link_employee(p_user uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_emp uuid;
begin
  select id into v_emp from public.employees
   where lower(email) = lower(p_email) and user_id is null limit 1;
  if v_emp is not null then
    update public.employees set user_id = p_user where id = v_emp;
    update public.profiles set employee_id = v_emp where id = p_user and employee_id is null;
  end if;
end $$;

create or replace function app.handle_user_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform app.link_employee(new.id, new.email);
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
  for each row execute function app.handle_user_confirmed();

-- Login by username: resolve to email (returns null when unknown).
create or replace function public.email_for_username(p_username text)
returns text language sql stable security definer set search_path = public as $$
  select email from public.profiles where username = lower(btrim(p_username)) limit 1
$$;
grant execute on function public.email_for_username(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Shared lookups ("Other" → new value saved for everyone)
-- ---------------------------------------------------------------------
create table public.lookup_values (
  id         bigint generated always as identity primary key,
  category   text not null,
  value      text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index lookup_values_uq on public.lookup_values (category, lower(btrim(value)));

-- Display-only translation cache (Arabic → English), never written back.
create table public.translations (
  hash       text primary key,
  source     text not null,
  en         text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Notifications & internal messages
-- ---------------------------------------------------------------------
create table public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  link       text,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

create table public.messages (
  id           bigint generated always as identity primary key,
  sender_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  subject      text,
  body         text not null,
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);
create index messages_recipient_idx on public.messages (recipient_id, read_at);

create or replace function app.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, link)
  values (p_user, p_kind, p_title, p_body, p_link)
$$;

create or replace function app.message_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform app.notify(new.recipient_id, 'message',
    coalesce((select full_name from public.profiles where id = new.sender_id), '') || ': ' || coalesce(new.subject, ''),
    left(new.body, 140), '/messages');
  return new;
end $$;
create trigger messages_notify after insert on public.messages for each row execute function app.message_notify();

-- Recipients may only flip read_at.
create or replace function app.guard_message()
returns trigger language plpgsql as $$
begin
  if new.body is distinct from old.body or new.subject is distinct from old.subject
     or new.sender_id is distinct from old.sender_id or new.recipient_id is distinct from old.recipient_id then
    raise exception 'FORBIDDEN: messages are immutable';
  end if;
  return new;
end $$;
create trigger messages_guard before update on public.messages for each row execute function app.guard_message();

-- Directory used by message/assignment pickers (names only).
create or replace view public.directory with (security_invoker = false) as
  select id, username, full_name, full_name_en, role, is_meeting_responsible, is_ceo
    from public.profiles where not suspended and app.authed();
revoke all on public.directory from anon;
grant select on public.directory to authenticated;

-- ---------------------------------------------------------------------
-- Outlook mailbox tokens: no client policies at all — only the outlook
-- edge function (service role) touches them, always scoped to the caller.
-- ---------------------------------------------------------------------
create table public.mail_accounts (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  email         text,
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  oauth_state   text,
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Developer console tables
-- ---------------------------------------------------------------------
create table public.bug_reports (
  id         bigint generated always as identity primary key,
  user_id    uuid default auth.uid() references public.profiles(id) on delete set null,
  kind       text not null default 'report' check (kind in ('report', 'auto')),
  message    text not null,
  stack      text,
  url        text,
  user_agent text,
  status     text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now()
);

create table public.auth_events (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles(id) on delete set null,
  event      text not null check (event in ('sign_in', 'sign_out', 'idle_sign_out', 'forced_sign_out', 'blocked')),
  ip         text,
  country    text,
  city       text,
  user_agent text,
  device_id  text,
  at         timestamptz not null default now()
);
create index auth_events_at_idx on public.auth_events (at desc);

create or replace function public.dev_force_signout(p_user uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not app.can('dev', true) then raise exception 'FORBIDDEN'; end if;
  delete from auth.sessions where user_id = p_user;
  insert into public.auth_events (user_id, event) values (p_user, 'forced_sign_out');
end $$;
grant execute on function public.dev_force_signout(uuid) to authenticated;

create or replace function public.dev_set_suspended(p_user uuid, p_suspended boolean)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not app.can('dev', true) then raise exception 'FORBIDDEN'; end if;
  update public.profiles set suspended = p_suspended where id = p_user;
  if p_suspended then
    delete from auth.sessions where user_id = p_user;
  end if;
end $$;
grant execute on function public.dev_set_suspended(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.employees        enable row level security;
alter table public.profiles         enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_permissions enable row level security;
alter table public.access_rules     enable row level security;
alter table public.app_settings     enable row level security;
alter table public.activity_log     enable row level security;
alter table public.lookup_values    enable row level security;
alter table public.translations     enable row level security;
alter table public.notifications    enable row level security;
alter table public.messages         enable row level security;
alter table public.mail_accounts    enable row level security;
alter table public.bug_reports      enable row level security;
alter table public.auth_events      enable row level security;

create policy profiles_self_read on public.profiles for select to authenticated
  using (id = auth.uid() or (select app.can('accounts')) or (select app.can('dev')));
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid() and (select app.access_ok()) or (select app.can('accounts', true)));

create policy role_perm_read on public.role_permissions for select to authenticated
  using ((select app.can('accounts')) or (select app.can('dev')));
create policy role_perm_write on public.role_permissions for all to authenticated
  using ((select app.can('dev', true))) with check ((select app.can('dev', true)));

create policy user_perm_read on public.user_permissions for select to authenticated
  using (user_id = auth.uid() or (select app.can('accounts')));
create policy user_perm_write on public.user_permissions for all to authenticated
  using ((select app.can('accounts', true))) with check ((select app.can('accounts', true)));

create policy access_rules_dev on public.access_rules for all to authenticated
  using ((select app.can('dev', true))) with check ((select app.can('dev', true)));

create policy settings_read on public.app_settings for select to authenticated using ((select app.authed()));
create policy settings_write on public.app_settings for all to authenticated
  using ((select app.can('dev', true))) with check ((select app.can('dev', true)));

create policy activity_dev on public.activity_log for select to authenticated using ((select app.can('dev')));

create policy lookup_read on public.lookup_values for select to authenticated using ((select app.authed()));
create policy lookup_add on public.lookup_values for insert to authenticated
  with check ((select app.authed()) and created_by = auth.uid());

create policy translations_read on public.translations for select to authenticated using ((select app.authed()));

create policy notif_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_mark on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy msg_read on public.messages for select to authenticated
  using ((sender_id = auth.uid() or recipient_id = auth.uid()) and (select app.can('messages')));
create policy msg_send on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and (select app.can('messages', true)));
create policy msg_mark on public.messages for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- mail_accounts: intentionally no policies (service role only).

create policy bugs_insert on public.bug_reports for insert to authenticated
  with check (user_id = auth.uid());
create policy bugs_dev on public.bug_reports for select to authenticated using ((select app.can('dev')));
create policy bugs_dev_update on public.bug_reports for update to authenticated
  using ((select app.can('dev', true))) with check ((select app.can('dev', true)));

create policy auth_events_dev on public.auth_events for select to authenticated using ((select app.can('dev')));

-- Realtime for the live bits of the UI.
alter publication supabase_realtime add table public.notifications, public.messages;

-- Used at sign-in to tell the browser whether access rules let this account in now.
create or replace function public.check_access()
returns boolean language sql stable security definer set search_path = public, app as $$
  select app.access_ok()
$$;
grant execute on function public.check_access() to authenticated;

-- ===== 20261030000002_projects.sql =====
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

-- ===== 20261030000003_hr.sql =====
-- =====================================================================
-- HR: employee files, leaves, payroll, settlements, performance.
-- Aisha (role hr) is the only editor; leave approvals: Aisha + CEO.
-- =====================================================================

create table public.employee_files (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  kind        text not null check (kind in ('contract', 'job_offer', 'work_start', 'other')),
  file_path   text not null,          -- storage: hr-files/<employee_id>/...
  file_name   text,
  uploaded_by uuid default auth.uid(),
  uploaded_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Leaves
-- ---------------------------------------------------------------------
create table public.leaves (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type  text not null default 'annual',
  start_date  date not null,
  end_date    date not null,
  days        int generated always as (end_date - start_date + 1) stored,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reason      text,
  decided_by  uuid references public.profiles(id),
  decided_at  timestamptz,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_date >= start_date),
  -- no overlapping active leaves for the same employee
  constraint leaves_no_overlap exclude using gist
    (employee_id with =, daterange(start_date, end_date, '[]') with &&)
    where (status in ('pending', 'approved'))
);

create or replace function app.guard_leave()
returns trigger language plpgsql security definer set search_path = public, app as $$
declare v_approver boolean;
begin
  select can_approve_leaves into v_approver from public.profiles where id = auth.uid();
  if tg_op = 'INSERT' then
    if new.status <> 'pending' and not coalesce(v_approver, false) then
      raise exception 'FORBIDDEN: new leaves start as pending';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    if not coalesce(v_approver, false) then
      raise exception 'FORBIDDEN: only HR (Aisha) and the CEO approve leaves';
    end if;
    new.decided_by := auth.uid();
    new.decided_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger leaves_guard before insert or update on public.leaves
  for each row execute function app.guard_leave();

create or replace function app.leave_notify()
returns trigger language plpgsql security definer set search_path = public, app as $$
declare v_user uuid; r record;
begin
  if tg_op = 'INSERT' then
    for r in select id from public.profiles where can_approve_leaves and not suspended loop
      perform app.notify(r.id, 'leave', 'طلب إجازة جديد', null, '/hr/leaves');
    end loop;
  elsif new.status is distinct from old.status then
    select user_id into v_user from public.employees where id = new.employee_id;
    if v_user is not null then
      perform app.notify(v_user, 'leave', 'تحديث حالة الإجازة: ' || new.status, null, '/my-checkin');
    end if;
  end if;
  return new;
end $$;
create trigger leaves_notify after insert or update on public.leaves
  for each row execute function app.leave_notify();

-- Accrued (pro-rata since hire) minus approved annual leave days.
create or replace view public.leave_balances with (security_invoker = true) as
select e.id as employee_id, e.full_name, e.hire_date, e.annual_leave_days,
       round(coalesce(e.annual_leave_days * (current_date - e.hire_date) / 365.0, 0), 1) as accrued,
       coalesce((select sum(l.days) from public.leaves l
                  where l.employee_id = e.id and l.status = 'approved' and l.leave_type = 'annual'), 0) as used,
       round(coalesce(e.annual_leave_days * (current_date - e.hire_date) / 365.0, 0), 1)
         - coalesce((select sum(l.days) from public.leaves l
                      where l.employee_id = e.id and l.status = 'approved' and l.leave_type = 'annual'), 0) as balance
  from public.employees e;

-- ---------------------------------------------------------------------
-- Payroll: advances & fines deducted, commissions added automatically.
-- ---------------------------------------------------------------------
create table public.advances (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  amount       numeric(12,2) not null check (amount > 0),
  deduct_month date not null,          -- first day of the month to deduct in
  note         text,
  created_at   timestamptz not null default now()
);
create table public.fines (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  amount      numeric(12,2) not null check (amount > 0),
  month       date not null,
  reason      text,
  created_at  timestamptz not null default now()
);
create table public.commissions (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  amount      numeric(12,2) not null check (amount > 0),
  month       date not null,
  source      text,
  quote_id    uuid unique,             -- one commission per won quote
  created_at  timestamptz not null default now()
);

create table public.payroll_runs (
  id         uuid primary key default gen_random_uuid(),
  month      date not null unique check (extract(day from month) = 1),
  status     text not null default 'draft' check (status in ('draft', 'approved', 'paid')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.payroll_items (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id   uuid not null references public.employees(id),
  establishment text,
  basic         numeric(12,2) not null default 0,
  allowances    numeric(12,2) not null default 0,
  commissions   numeric(12,2) not null default 0,
  advances      numeric(12,2) not null default 0,
  fines         numeric(12,2) not null default 0,
  net           numeric(12,2) generated always as (basic + allowances + commissions - advances - fines) stored,
  paid          boolean not null default false,
  paid_at       timestamptz,
  unique (run_id, employee_id)
);

create or replace function public.generate_payroll(p_month date)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_month date := date_trunc('month', p_month)::date; v_run uuid;
begin
  if not app.can('payroll', true) then raise exception 'FORBIDDEN'; end if;
  insert into public.payroll_runs (month) values (v_month)
    on conflict (month) do update set month = excluded.month
    returning id into v_run;
  if (select status from public.payroll_runs where id = v_run) <> 'draft' then
    raise exception 'PAYROLL_LOCKED: run is % ', (select status from public.payroll_runs where id = v_run);
  end if;
  insert into public.payroll_items (run_id, employee_id, establishment, basic, allowances, commissions, advances, fines)
  select v_run, e.id, e.establishment, e.basic_salary,
         e.housing_allowance + e.transport_allowance + e.other_allowance,
         coalesce((select sum(amount) from public.commissions c where c.employee_id = e.id and date_trunc('month', c.month) = v_month), 0),
         coalesce((select sum(amount) from public.advances a where a.employee_id = e.id and date_trunc('month', a.deduct_month) = v_month), 0),
         coalesce((select sum(amount) from public.fines f where f.employee_id = e.id and date_trunc('month', f.month) = v_month), 0)
    from public.employees e where e.status = 'active'
  on conflict (run_id, employee_id) do update set
    establishment = excluded.establishment, basic = excluded.basic, allowances = excluded.allowances,
    commissions = excluded.commissions, advances = excluded.advances, fines = excluded.fines
  where not public.payroll_items.paid;
  return v_run;
end $$;
grant execute on function public.generate_payroll(date) to authenticated;

create or replace view public.establishment_payroll with (security_invoker = true) as
select r.month, coalesce(i.establishment, '—') as establishment, count(*) as employees,
       sum(i.basic) as basic, sum(i.allowances) as allowances, sum(i.commissions) as commissions,
       sum(i.advances) as advances, sum(i.fines) as fines, sum(i.net) as net,
       sum(i.net) filter (where i.paid) as paid
  from public.payroll_items i join public.payroll_runs r on r.id = i.run_id
 group by r.month, coalesce(i.establishment, '—');

-- ---------------------------------------------------------------------
-- Settlements (مخالصات) — Saudi labour law end-of-service benefit.
-- ---------------------------------------------------------------------
create table public.settlements (
  id                  uuid primary key default gen_random_uuid(),
  employee_id         uuid references public.employees(id),
  employee_name       text not null,
  hire_date           date not null,
  end_date            date not null,
  reason              text not null default 'contract_end' check (reason in ('contract_end', 'termination', 'resignation')),
  last_salary         numeric(12,2) not null default 0,  -- full wage used for EOSB
  leave_balance_days  numeric(6,1) not null default 0,
  service_years       numeric(6,2),
  eosb                numeric(12,2),
  leave_compensation  numeric(12,2),
  other_dues          numeric(12,2) not null default 0,
  deductions          numeric(12,2) not null default 0,
  total               numeric(12,2),
  source_files        text[] not null default '{}',
  ai_extracted        jsonb,
  notes               text,
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now()
);

create or replace function app.calc_settlement()
returns trigger language plpgsql as $$
declare y numeric; full_eosb numeric;
begin
  y := round((new.end_date - new.hire_date) / 365.25, 2);
  new.service_years := y;
  full_eosb := new.last_salary * 0.5 * least(y, 5) + new.last_salary * greatest(y - 5, 0);
  new.eosb := round(case
    when new.reason <> 'resignation' then full_eosb
    when y < 2 then 0
    when y < 5 then full_eosb / 3
    when y < 10 then full_eosb * 2 / 3
    else full_eosb end, 2);
  new.leave_compensation := round(new.last_salary / 30 * greatest(new.leave_balance_days, 0), 2);
  new.total := new.eosb + new.leave_compensation + new.other_dues - new.deductions;
  return new;
end $$;
create trigger settlements_calc before insert or update on public.settlements
  for each row execute function app.calc_settlement();

create table public.performance_reviews (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  period      text not null,
  reviewer_id uuid default auth.uid() references public.profiles(id),
  quality     int check (quality between 1 and 5),
  productivity int check (productivity between 1 and 5),
  teamwork    int check (teamwork between 1 and 5),
  attendance  int check (attendance between 1 and 5),
  overall     numeric(3,2) generated always as
                ((coalesce(quality, 0) + coalesce(productivity, 0) + coalesce(teamwork, 0) + coalesce(attendance, 0)) / 4.0) stored,
  comments    text,
  created_at  timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['employee_files','leaves','advances','fines','commissions','payroll_runs',
                           'payroll_items','settlements','performance_reviews'] loop
    perform app.track(('public.' || t)::regclass);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.employee_files      enable row level security;
alter table public.leaves              enable row level security;
alter table public.advances            enable row level security;
alter table public.fines               enable row level security;
alter table public.commissions         enable row level security;
alter table public.payroll_runs        enable row level security;
alter table public.payroll_items       enable row level security;
alter table public.settlements         enable row level security;
alter table public.performance_reviews enable row level security;

-- Employees: HR reads/writes; others with read modules see the list;
-- each person sees their own row.
create policy emp_read on public.employees for select to authenticated
  using ((select app.can('hr')) or (select app.can('attendance')) or user_id = auth.uid()
         or (select app.can('custody')) or (select app.can('residencies')) or (select app.can('fleet')));
create policy emp_write on public.employees for all to authenticated
  using ((select app.can('hr', true))) with check ((select app.can('hr', true)));

create policy empfiles_read on public.employee_files for select to authenticated using ((select app.can('hr')));
create policy empfiles_write on public.employee_files for all to authenticated
  using ((select app.can('hr', true))) with check ((select app.can('hr', true)));

create policy leaves_read on public.leaves for select to authenticated
  using ((select app.can('leaves'))
         or employee_id = (select app.my_employee_id())
         or exists (select 1 from public.profiles where id = auth.uid() and can_approve_leaves));
create policy leaves_hr_write on public.leaves for insert to authenticated
  with check ((select app.can('leaves', true)) or employee_id = (select app.my_employee_id()));
create policy leaves_update on public.leaves for update to authenticated
  using ((select app.can('leaves', true))
         or exists (select 1 from public.profiles where id = auth.uid() and can_approve_leaves)
         or (employee_id = (select app.my_employee_id()) and status = 'pending'))
  with check ((select app.can('leaves', true))
              or exists (select 1 from public.profiles where id = auth.uid() and can_approve_leaves)
              or employee_id = (select app.my_employee_id()));  -- transitions guarded by app.guard_leave()

do $$
declare t text;
begin
  foreach t in array array['advances','fines','commissions','payroll_runs','payroll_items'] loop
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using ((select app.can(''payroll'')))', t);
    execute format('create policy %1$s_write on public.%1$s for all to authenticated
                    using ((select app.can(''payroll'', true))) with check ((select app.can(''payroll'', true)))', t);
  end loop;
end $$;

create policy settle_read on public.settlements for select to authenticated using ((select app.can('settlements')));
create policy settle_write on public.settlements for all to authenticated
  using ((select app.can('settlements', true))) with check ((select app.can('settlements', true)));

create policy perf_read on public.performance_reviews for select to authenticated
  using ((select app.can('performance')) or employee_id = (select app.my_employee_id()));
create policy perf_write on public.performance_reviews for all to authenticated
  using ((select app.can('performance', true))) with check ((select app.can('performance', true)));

-- ===== 20261030000004_attendance.sql =====
-- =====================================================================
-- Attendance: ZKTeco ADMS push, phone check-in (selfie + location),
-- supervisor punches, "My check-in". Work starts 09:00, late after 09:30.
-- =====================================================================

create table public.attendance_devices (
  serial_no    text primary key,
  name         text,
  approved     boolean not null default false,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now()
);

create table public.attendance_logs (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  punched_at    timestamptz not null default now(),
  work_date     date not null,
  punch_type    text not null default 'in' check (punch_type in ('in', 'out', 'auto')),
  source        text not null check (source in ('device', 'phone', 'supervisor', 'self')),
  device_serial text references public.attendance_devices(serial_no),
  lat           double precision,
  lng           double precision,
  distance_m    double precision,     -- recorded, never enforced
  selfie_path   text,
  recorded_by   uuid references public.profiles(id),
  raw           text,
  created_at    timestamptz not null default now()
);
-- device re-sends the same records: ignore exact duplicates
create unique index attendance_device_uq on public.attendance_logs (employee_id, punched_at)
  where source = 'device';
-- phone/self/supervisor: one "in" and one "out" per day
create unique index attendance_manual_uq on public.attendance_logs (employee_id, work_date, punch_type)
  where source in ('phone', 'supervisor', 'self');

create or replace function app.attendance_defaults()
returns trigger language plpgsql as $$
begin
  new.work_date := (new.punched_at at time zone 'Asia/Riyadh')::date;
  return new;
end $$;
create trigger attendance_defaults before insert or update on public.attendance_logs
  for each row execute function app.attendance_defaults();

insert into public.app_settings (key, value) values
  ('office_location', '{"lat": 24.7624564, "lng": 46.6726382}'),
  ('work_hours', '{"start": "09:00", "late_after": "09:30", "timezone": "Asia/Riyadh"}')
on conflict (key) do nothing;

create or replace function public.distance_m(lat1 double precision, lng1 double precision,
                                             lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

create or replace view public.attendance_daily with (security_invoker = true) as
select l.employee_id, e.full_name, l.work_date,
       min(l.punched_at) filter (where l.punch_type in ('in', 'auto'))  as first_in,
       max(l.punched_at) filter (where l.punch_type in ('out', 'auto')) as last_out,
       count(*) as punches,
       (min(l.punched_at at time zone 'Asia/Riyadh') filter (where l.punch_type in ('in', 'auto')))::time > time '09:30' as is_late,
       greatest(0, extract(epoch from
         ((min(l.punched_at at time zone 'Asia/Riyadh') filter (where l.punch_type in ('in', 'auto')))::time - time '09:00')) / 60)::int as minutes_after_start
  from public.attendance_logs l join public.employees e on e.id = l.employee_id
 group by l.employee_id, e.full_name, l.work_date;

-- Supervisor punches for their workers (or any HR/attendance editor).
create or replace function public.supervisor_punch(p_employee uuid, p_type text,
                                                   p_lat double precision default null,
                                                   p_lng double precision default null)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_ok boolean; v_id uuid; v_office jsonb;
begin
  select app.can('attendance', true)
      or (exists (select 1 from public.profiles where id = auth.uid() and is_supervisor)
          and exists (select 1 from public.employees where id = p_employee and supervisor_id = app.my_employee_id()))
    into v_ok;
  if not v_ok then raise exception 'FORBIDDEN: not this worker''s supervisor'; end if;
  select value into v_office from public.app_settings where key = 'office_location';
  insert into public.attendance_logs (employee_id, punch_type, source, lat, lng, distance_m, recorded_by)
  values (p_employee, p_type, 'supervisor', p_lat, p_lng,
          case when p_lat is not null then public.distance_m(p_lat, p_lng, (v_office->>'lat')::float8, (v_office->>'lng')::float8) end,
          auth.uid())
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'DUPLICATE: already punched % today', p_type;
end $$;
grant execute on function public.supervisor_punch(uuid, text, double precision, double precision) to authenticated;

select app.track('public.attendance_devices');

alter table public.attendance_devices enable row level security;
alter table public.attendance_logs    enable row level security;

create policy devices_read on public.attendance_devices for select to authenticated using ((select app.can('attendance')));
create policy devices_write on public.attendance_devices for all to authenticated
  using ((select app.can('attendance', true))) with check ((select app.can('attendance', true)));

create policy att_read on public.attendance_logs for select to authenticated
  using ((select app.can('attendance'))
         or employee_id = (select app.my_employee_id())
         or employee_id in (select id from public.employees where supervisor_id = (select app.my_employee_id())));
create policy att_write on public.attendance_logs for all to authenticated
  using ((select app.can('attendance', true))) with check ((select app.can('attendance', true)));
-- phone/self check-ins are written by the phone-checkin edge function (service role)

-- ===== 20261030000005_sales.sql =====
-- =====================================================================
-- Sales: quote requests with approval stages, 2% commission on pre-VAT
-- value (frozen after "won"), client meetings with notified owner.
-- Each sales user sees only her own work.
-- =====================================================================

create sequence public.quote_no_seq;

create table public.quote_requests (
  id              uuid primary key default gen_random_uuid(),
  ref_no          text unique,
  owner_id        uuid not null default auth.uid() references public.profiles(id),
  client_name     text not null,
  client_email    text,
  client_phone    text,
  project_title   text not null,
  sector          text,
  description     text,
  stage           text not null default 'new'
                  check (stage in ('new', 'pricing', 'manager_review', 'ceo_approval', 'sent', 'negotiation', 'won', 'lost')),
  value_pre_vat   numeric(14,2) not null default 0,
  vat_rate        numeric(5,2) not null default 15,
  value_with_vat  numeric(14,2) generated always as (round(value_pre_vat * (1 + vat_rate / 100), 2)) stored,
  commission      numeric(14,2) generated always as (round(value_pre_vat * 0.02, 2)) stored,
  due_date        date,
  won_at          timestamptz,
  lost_reason     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.quote_stage_history (
  id         bigint generated always as identity primary key,
  quote_id   uuid not null references public.quote_requests(id) on delete cascade,
  from_stage text,
  to_stage   text not null,
  changed_by uuid default auth.uid(),
  note       text,
  at         timestamptz not null default now()
);

create or replace function app.quote_guard()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if tg_op = 'INSERT' then
    new.ref_no := 'Q-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.quote_no_seq')::text, 4, '0');
    if not app.can('sales_all', true) then new.owner_id := auth.uid(); end if;
    if new.stage = 'won' then new.won_at := now(); end if;
    return new;
  end if;
  if old.stage = 'won' and (
       new.value_pre_vat is distinct from old.value_pre_vat
    or new.vat_rate is distinct from old.vat_rate
    or new.stage is distinct from old.stage
    or new.owner_id is distinct from old.owner_id
    or new.client_name is distinct from old.client_name) then
    raise exception 'FROZEN: quote values are locked after "won"';
  end if;
  if new.ref_no is distinct from old.ref_no then raise exception 'FORBIDDEN: reference is fixed'; end if;
  if new.owner_id is distinct from old.owner_id and not app.can('sales_all', true) then
    raise exception 'FORBIDDEN: cannot reassign quote';
  end if;
  if new.stage = 'won' and old.stage <> 'won' then new.won_at := now(); end if;
  new.updated_at := now();
  return new;
end $$;
create trigger quotes_guard before insert or update on public.quote_requests
  for each row execute function app.quote_guard();

create or replace function app.quote_after()
returns trigger language plpgsql security definer set search_path = public, app as $$
declare v_emp uuid;
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    insert into public.quote_stage_history (quote_id, from_stage, to_stage)
    values (new.id, case when tg_op = 'UPDATE' then old.stage end, new.stage);
  end if;
  -- Won → commission added to the owner's next payroll automatically.
  if new.stage = 'won' and (tg_op = 'INSERT' or old.stage <> 'won') and new.commission > 0 then
    select employee_id into v_emp from public.profiles where id = new.owner_id;
    if v_emp is not null then
      insert into public.commissions (employee_id, amount, month, source, quote_id)
      values (v_emp, new.commission, date_trunc('month', now())::date, 'quote ' || new.ref_no, new.id)
      on conflict (quote_id) do nothing;
    end if;
  end if;
  return null;
end $$;
create trigger quotes_after after insert or update on public.quote_requests
  for each row execute function app.quote_after();

create table public.sales_meetings (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references public.profiles(id),
  quote_id         uuid references public.quote_requests(id) on delete set null,
  client_name      text not null,
  meeting_at       timestamptz not null,
  location         text,
  agenda           text,
  responsible_id   uuid not null references public.profiles(id),
  outcome          text,
  created_at       timestamptz not null default now()
);

create or replace function app.meeting_notify()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if not exists (select 1 from public.profiles where id = new.responsible_id and is_meeting_responsible) then
    raise exception 'INVALID: responsible person must be Haitham, the CEO or Eilaf';
  end if;
  if tg_op = 'INSERT' or new.responsible_id is distinct from old.responsible_id or new.meeting_at is distinct from old.meeting_at then
    perform app.notify(new.responsible_id, 'meeting',
      'اجتماع مع ' || new.client_name || ' — ' || to_char(new.meeting_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'),
      new.agenda, '/sales?tab=meetings');
  end if;
  return new;
end $$;
create trigger meetings_notify before insert or update on public.sales_meetings
  for each row execute function app.meeting_notify();

select app.track('public.quote_requests');
select app.track('public.sales_meetings');

alter table public.quote_requests      enable row level security;
alter table public.quote_stage_history enable row level security;
alter table public.sales_meetings      enable row level security;

create policy quotes_read on public.quote_requests for select to authenticated
  using (((select app.can('sales')) and owner_id = auth.uid()) or (select app.can('sales_all')));
create policy quotes_insert on public.quote_requests for insert to authenticated
  with check ((select app.can('sales', true)) or (select app.can('sales_all', true)));
create policy quotes_update on public.quote_requests for update to authenticated
  using (((select app.can('sales', true)) and owner_id = auth.uid()) or (select app.can('sales_all', true)))
  with check (((select app.can('sales', true)) and owner_id = auth.uid()) or (select app.can('sales_all', true)));

create policy qhist_read on public.quote_stage_history for select to authenticated
  using (exists (select 1 from public.quote_requests q where q.id = quote_id));  -- inherits quote RLS

create policy meetings_read on public.sales_meetings for select to authenticated
  using (((select app.can('sales')) and owner_id = auth.uid()) or responsible_id = auth.uid() or (select app.can('sales_all')));
create policy meetings_write on public.sales_meetings for all to authenticated
  using (((select app.can('sales', true)) and owner_id = auth.uid()) or (select app.can('sales_all', true)))
  with check (((select app.can('sales', true)) and owner_id = auth.uid()) or (select app.can('sales_all', true)));
create policy meetings_outcome on public.sales_meetings for update to authenticated
  using (responsible_id = auth.uid()) with check (responsible_id = auth.uid());

-- ===== 20261030000006_construction.sql =====
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

-- ===== 20261030000007_my_projects_storage_seed.sql =====
-- =====================================================================
-- "My Projects" for self-signup project managers, storage buckets,
-- role defaults and lookup seeds.
-- =====================================================================

create table public.my_projects (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name       text not null,
  client     text,
  location   text,
  start_date date,
  end_date   date,
  status     text not null default 'active',
  progress   numeric(5,2) not null default 0 check (progress between 0 and 100),
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.my_project_reports (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.my_projects(id) on delete cascade,
  owner_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  report_date date not null default current_date,
  title       text not null,
  body        text,
  created_at  timestamptz not null default now()
);

create table public.my_project_files (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.my_projects(id) on delete cascade,
  owner_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  file_path  text not null,       -- storage: my-projects/<owner_id>/...
  file_name  text,
  created_at timestamptz not null default now()
);

create trigger my_projects_touch before update on public.my_projects for each row execute function app.touch();
select app.track('public.my_projects');
select app.track('public.my_project_reports');

alter table public.my_projects        enable row level security;
alter table public.my_project_reports enable row level security;
alter table public.my_project_files   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['my_projects','my_project_reports','my_project_files'] loop
    execute format('create policy %1$s_owner on public.%1$s for all to authenticated
      using (owner_id = auth.uid() and (select app.can(''my_projects'', true)))
      with check (owner_id = auth.uid() and (select app.can(''my_projects'', true)))', t);
    execute format('create policy %1$s_admin_read on public.%1$s for select to authenticated
      using ((select app.can(''my_projects_all'')))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Storage (all private; access only through RLS + signed URLs)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit) values
  ('hr-files',     'hr-files',     false, 26214400),
  ('selfies',      'selfies',      false, 10485760),
  ('construction', 'construction', false, 52428800),
  ('my-projects',  'my-projects',  false, 52428800),
  ('documents',    'documents',    false, 26214400)
on conflict (id) do nothing;

create policy "hr files read" on storage.objects for select to authenticated
  using (bucket_id = 'hr-files' and (select app.can('hr')));
create policy "hr files write" on storage.objects for insert to authenticated
  with check (bucket_id = 'hr-files' and (select app.can('hr', true)));
create policy "hr files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'hr-files' and (select app.can('hr', true)));

create policy "selfies read" on storage.objects for select to authenticated
  using (bucket_id = 'selfies' and (select app.can('attendance')));

create policy "construction read" on storage.objects for select to authenticated
  using (bucket_id = 'construction' and app.cp_can_read((storage.foldername(name))[1]::uuid));
create policy "construction write" on storage.objects for insert to authenticated
  with check (bucket_id = 'construction'
              and app.cp_can_write((storage.foldername(name))[1]::uuid, '{document_controller,site_engineer}'));

create policy "my projects own" on storage.objects for all to authenticated
  using (bucket_id = 'my-projects' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'my-projects' and (storage.foldername(name))[1] = auth.uid()::text
              and (select app.can('my_projects', true)));
create policy "my projects admin read" on storage.objects for select to authenticated
  using (bucket_id = 'my-projects' and (select app.can('my_projects_all')));

create policy "documents read" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (select app.can('documents')));
create policy "documents write" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (select app.can('documents', true)));

-- ---------------------------------------------------------------------
-- Role defaults
-- ---------------------------------------------------------------------
insert into public.role_permissions (role, module, can_write) values
  -- admin (Eilaf, Eng. Abdelrhman)
  ('admin','projects',true), ('admin','payments',true), ('admin','budget',true), ('admin','accounting',true),
  ('admin','bank',true), ('admin','project_reports',true), ('admin','custody',true), ('admin','fleet',true),
  ('admin','documents',true), ('admin','residencies',true), ('admin','exec_summary',false),
  ('admin','accounts',true), ('admin','hr',false), ('admin','leaves',false), ('admin','attendance',false),
  ('admin','sales_all',false), ('admin','my_projects_all',false), ('admin','construction',true),
  ('admin','messages',true), ('admin','mail',true), ('admin','my_checkin',true), ('admin','advisor',false),
  -- executive (Hisham / CEO): read-only summary
  ('executive','exec_summary',false), ('executive','projects',false), ('executive','budget',false),
  ('executive','payments',false), ('executive','project_reports',false), ('executive','leaves',false),
  ('executive','sales_all',false), ('executive','messages',true), ('executive','mail',true),
  ('executive','my_checkin',true), ('executive','advisor',false),
  -- hr (Aisha): sole HR editor
  ('hr','hr',true), ('hr','leaves',true), ('hr','payroll',true), ('hr','settlements',true),
  ('hr','performance',true), ('hr','attendance',true), ('hr','residencies',true), ('hr','custody',false),
  ('hr','messages',true), ('hr','mail',true), ('hr','my_checkin',true), ('hr','advisor',false),
  -- sales (Hala, Nagla): sales page only, own rows
  ('sales','sales',true),
  -- self-signup project managers
  ('manager','my_projects',true),
  -- developer: /dev only
  ('developer','dev',true), ('developer','accounts',true),
  -- read-only viewer
  ('viewer','projects',false), ('viewer','payments',false), ('viewer','budget',false),
  ('viewer','project_reports',false), ('viewer','exec_summary',false)
on conflict do nothing;

insert into public.lookup_values (category, value, created_by) values
  ('sector', 'حكومي', null), ('sector', 'خاص', null), ('sector', 'سكني', null), ('sector', 'تجاري', null),
  ('sector', 'صناعي', null),
  ('payment_method', 'تحويل بنكي', null), ('payment_method', 'شيك', null), ('payment_method', 'نقدي', null),
  ('project_status', 'active', null), ('project_status', 'on_hold', null), ('project_status', 'completed', null),
  ('leave_type', 'annual', null), ('leave_type', 'sick', null), ('leave_type', 'unpaid', null),
  ('leave_type', 'emergency', null),
  ('department', 'المشاريع', null), ('department', 'الموارد البشرية', null), ('department', 'المبيعات', null),
  ('department', 'المالية', null),
  ('weather', 'مشمس', null), ('weather', 'غائم', null), ('weather', 'رياح/غبار', null), ('weather', 'ممطر', null),
  ('trade', 'نجار', null), ('trade', 'حداد', null), ('trade', 'بناء', null), ('trade', 'كهربائي', null),
  ('trade', 'سباك', null), ('trade', 'عامل', null)
on conflict do nothing;

-- ===== 20261030000008_hardening.sql =====
-- Hardening from the Supabase security advisor.
-- 1) Only email_for_username is meant to be callable before sign-in.
revoke execute on function public.check_access() from public, anon;
revoke execute on function public.dev_force_signout(uuid) from public, anon;
revoke execute on function public.dev_set_suspended(uuid, boolean) from public, anon;
revoke execute on function public.generate_payroll(date) from public, anon;
revoke execute on function public.my_permissions() from public, anon;
revoke execute on function public.supervisor_punch(uuid, text, double precision, double precision) from public, anon;
revoke execute on function public.projects_in_period(date, date) from public, anon;

-- 2) Pin search_path on the remaining functions.
alter function public.projects_in_period(date, date) set search_path = public;
alter function public.distance_m(double precision, double precision, double precision, double precision) set search_path = public;
alter function app.request_header(text) set search_path = public;
alter function app.authed() set search_path = public, app;
alter function app.touch() set search_path = public;
alter function app.versioned() set search_path = public;
alter function app.track(regclass) set search_path = public, app;
alter function app.guard_message() set search_path = public;
alter function app.assign_receipt() set search_path = public;
alter function app.calc_settlement() set search_path = public;
alter function app.attendance_defaults() set search_path = public;
alter function app.submission_guard() set search_path = public;
alter function app.invoice_numbering() set search_path = public;
alter function app.invoice_guard() set search_path = public;
