-- 변경 (2026-11-26): 강사도 등록된 모든 회원 명단을 보고, 모든 반의 출석·진도를 입력할 수 있게 함.
-- 주소·내부 메모(member_private), 결제, 상태 이력, 초대코드는 계속 관리자 전용.
drop policy if exists members_read on public.members;
create policy members_read on public.members for select to authenticated using (public.is_staff());

drop policy if exists progress_rw on public.progress;
create policy progress_rw on public.progress for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists attendance_rw on public.attendance;
create policy attendance_rw on public.attendance for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
