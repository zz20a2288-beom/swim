-- 가짜 데이터 전부 삭제 (직원 계정은 남김). 실제 데이터를 넣기 직전에 한 번 실행합니다.
begin;
delete from public.guardians;
delete from public.invites;
delete from public.redeem_attempts;
delete from public.attendance;
delete from public.progress;
delete from public.payments;
delete from public.member_status_log;
delete from public.member_private;
delete from public.members;
delete from public.payment_links;
delete from public.notices;
delete from public.classes;
commit;
