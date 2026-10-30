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
