-- 원장님 계정을 최초 관리자로 지정합니다.
-- 먼저 관리자 화면에서 '처음이에요 (가입)'으로 가입한 뒤, 아래 이메일을 바꿔서 실행하세요.
insert into public.staff (user_id, name, email, role)
select id, '원장', email, 'admin' from auth.users where lower(email) = lower('여기에-원장님-이메일')
on conflict (user_id) do update set role = 'admin', active = true;
