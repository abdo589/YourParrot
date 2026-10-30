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
