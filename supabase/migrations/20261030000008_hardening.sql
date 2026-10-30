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
