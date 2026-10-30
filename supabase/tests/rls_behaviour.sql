-- Behaviour checks for RLS and triggers. Lines that print ERROR are deliberate
-- negative cases (duplicates, version conflicts, frozen "won" quotes, non-A/B
-- WIR invoicing, overlapping leaves, restoring tombstones, privilege escalation).

\set ON_ERROR_STOP 0
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('00000000-0000-0000-0000-00000000000a','eilaf@mf.sa','{"username":"eilaf"}',now()),
 ('00000000-0000-0000-0000-00000000000b','aisha@mf.sa','{"username":"aisha"}',now()),
 ('00000000-0000-0000-0000-00000000000c','hala@mf.sa','{"username":"hala"}',now()),
 ('00000000-0000-0000-0000-00000000000d','nagla@mf.sa','{"username":"nagla"}',now()),
 ('00000000-0000-0000-0000-00000000000e','hisham@mf.sa','{"username":"hisham"}',now()),
 ('00000000-0000-0000-0000-00000000000f','ali@mf.sa','{"username":"ali"}',now()),
 ('00000000-0000-0000-0000-000000000010','pm@x.com','{"username":"eilaf"}',null);
\i supabase/seed_people.sql
select username, role, self_signup from profiles order by username;
insert into employees(full_name,email,basic_salary,housing_allowance,hire_date) values ('Hala E','hala@mf.sa',8000,2000,'2020-01-01'),('PM','pm@x.com',1,0,'2024-01-01');
-- confirm pm → linked
update auth.users set email_confirmed_at=now() where email='pm@x.com';
select username, employee_id is not null linked from profiles where email='pm@x.com';
update profiles set employee_id=(select id from employees where email='hala@mf.sa') where username='hala';

create function as_user(u text) returns void language plpgsql security definer as $$ begin perform set_config('request.jwt.claim.sub',(select id::text from profiles where username=u),false); end $$;
grant execute on function as_user to authenticated;
set role authenticated;

\echo '--- eilaf projects'
select as_user('eilaf');
insert into projects(name,client,contract_value) values ('Tower A','ACME',1000000);
insert into projects(name,client) values (' tower a ','acme');
update projects set progress=10, version=1 where name='Tower A';
update projects set progress=20, version=1 where name='Tower A';
insert into payments(project_id,amount,receipt_no) select id,5000,1 from projects;
insert into payments(project_id,amount) select id,5000 from projects;
select name, received, version from projects;
select receipt_no from payments;
update projects set deleted_at=now(), version=3 where name='Tower A';
update projects set deleted_at=null, version=4 where name='Tower A';
\echo '--- hala sees projects? (expect 0)'
select as_user('hala');
select count(*) from projects;
insert into quote_requests(client_name,project_title,value_pre_vat) values ('C1','Villa',100000);
select as_user('nagla');
select count(*) nagla_sees from quote_requests;
select as_user('hala');
update quote_requests set stage='won';
update quote_requests set value_pre_vat=1;
select ref_no, stage, commission, value_with_vat from quote_requests;
reset role; select employee_id is not null, amount from commissions; set role authenticated;
\echo '--- ali'
select as_user('ali');
select count(*) ali_projects from projects;
insert into cp_projects(code,name) values ('P01','Bridge') ;
insert into submissions(project_id,type,title) select id,'WIR','Footings' from cp_projects;
insert into submissions(project_id,type,title) select id,'WIR','Columns' from cp_projects;
update submissions set code='C' where title='Footings';
update submissions set code='A' where title='Columns';
insert into submissions(parent_id,title) select id,'Footings r1' from submissions where title='Footings';
select ref_no, code, superseded from submissions order by ref_no;
insert into cp_invoices(project_id,period_from,period_to) select id,'2026-10-01','2026-10-31' from cp_projects;
insert into cp_invoice_items(invoice_id,submission_id,amount) select i.id,s.id,100000 from cp_invoices i, submissions s where s.title='Footings';
insert into cp_invoice_items(invoice_id,submission_id,amount) select i.id,s.id,100000 from cp_invoices i, submissions s where s.title='Columns';
select invoice_no,gross_amount,retention_amount,net_amount from cp_invoices;
select * from cp_dashboard;
\echo '--- leaves'
select as_user('aisha');
insert into leaves(employee_id,start_date,end_date) select id,'2026-11-01','2026-11-05' from employees where email='hala@mf.sa';
insert into leaves(employee_id,start_date,end_date) select id,'2026-11-04','2026-11-08' from employees where email='hala@mf.sa';
update leaves set status='approved';
select status, days, decided_by is not null from leaves;
select full_name, balance from leave_balances where full_name='Hala E';
select generate_payroll('2026-10-15');
select basic, allowances, commissions, net from payroll_items;
select as_user('eilaf');
update leaves set status='rejected';
select count(*) eilaf_payroll from payroll_items;
\echo '--- resubmit + tombstone + dev'
select as_user('ali');
insert into submissions(parent_id,title) select id,'Footings r1' from submissions where title='Footings';
select ref_no, rev, code, superseded from submissions order by ref_no;
select as_user('eilaf');
update projects set deleted_at=now(), version=2 where name='Tower A';
update projects set deleted_at=null, version=3 where name='Tower A';
select count(*) visible_deleted from projects where deleted_at is not null;
select as_user('hala');
update profiles set role='admin' where username='hala';
select module from my_permissions();
select as_user('ali');
select module from my_permissions() order by 1;
