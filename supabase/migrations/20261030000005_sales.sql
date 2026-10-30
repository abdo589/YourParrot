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
