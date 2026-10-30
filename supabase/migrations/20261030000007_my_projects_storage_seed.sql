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
