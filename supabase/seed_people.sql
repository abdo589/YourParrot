-- Run AFTER creating the staff accounts (Dev console → Accounts, or the
-- admin-users edge function). Usernames are the ones used at sign-in.
-- Adjust usernames below if you chose different ones.

update public.profiles set role = 'admin', self_signup = false, can_multi_account = true, is_meeting_responsible = true,
       full_name = 'إيلاف', full_name_en = 'Eilaf' where username = 'eilaf';
update public.profiles set role = 'admin', self_signup = false,
       full_name = 'م. عبدالرحمن', full_name_en = 'Eng. Abdelrhman' where username = 'abdelrhman';
update public.profiles set role = 'hr', self_signup = false, can_approve_leaves = true,
       full_name = 'عائشة', full_name_en = 'Aisha' where username = 'aisha';
update public.profiles set role = 'sales', self_signup = false, full_name = 'هالة', full_name_en = 'Hala' where username = 'hala';
update public.profiles set role = 'sales', self_signup = false, full_name = 'نجلاء', full_name_en = 'Nagla' where username = 'nagla';
update public.profiles set role = 'executive', self_signup = false, is_ceo = true, can_approve_leaves = true,
       is_meeting_responsible = true, full_name = 'هشام', full_name_en = 'Hisham' where username = 'hisham';
update public.profiles set role = 'developer', self_signup = false,
       full_name = 'عبدالرحمن (مطوّر)', full_name_en = 'Abdelrhman (Dev)' where username = 'dev';
update public.profiles set role = 'admin', self_signup = false, full_name = 'علي', full_name_en = 'Ali' where username = 'ali';
update public.profiles set is_meeting_responsible = true, self_signup = false,
       full_name = 'هيثم', full_name_en = 'Haitham' where username = 'haitham';

-- Ali: construction module + messages, mail and my check-in only.
insert into public.user_permissions (user_id, module, can_write)
select id, m.module, true from public.profiles,
       (values ('construction'), ('messages'), ('mail'), ('my_checkin')) as m(module)
 where username = 'ali'
on conflict do nothing;
