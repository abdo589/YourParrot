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
