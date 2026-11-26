-- =====================================================================
-- 로얄마린 수영장 통합관리 — 데이터베이스 + 보안 규칙(RLS)
-- Supabase SQL Editor에서 한 번에 실행합니다.
-- 원칙
--   * 모든 테이블 RLS 켬. 로그인 안 한 사람(anon)은 아무것도 못 봄.
--   * 관리자(admin): 전부. 강사(teacher): 담당 반 명단·출석·진도만.
--   * 학부모: 테이블에 직접 접근 불가. 아래 parent_* 함수로
--     "연결된 자기 아이"의 공개 가능한 항목만 받음 (주소·메모·연락처 제외).
--   * 주소·내부 메모는 member_private 테이블에 분리 → 관리자만.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- 테이블 ----------
create table public.staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  email      text,
  role       text not null check (role in ('admin','teacher')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.classes (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  kind         text not null check (kind in ('child','adult')),
  level        text not null check (level in ('초급','중급','상급')),
  days         int[] not null,                 -- 0=월 1=화 2=수 3=목 4=금 5=토 6=일
  start_time   time not null,
  capacity     int not null check (capacity between 1 and 100),
  teacher_id   uuid references public.staff(user_id) on delete set null,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.members (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('child','adult')),
  name             text not null check (length(name) between 1 and 40),
  birth            date,
  gender           text check (gender in ('남','여')),
  school           text,
  guardian_phone1  text,
  guardian_phone2  text,
  shuttle_route    text,
  class_id         uuid references public.classes(id) on delete set null,
  status           text not null default '재원' check (status in ('재원','휴회','탈회')),
  first_registered date not null default ((now() at time zone 'Asia/Seoul')::date),
  pass_end         date,
  created_at       timestamptz not null default now()
);
create index on public.members(class_id);
create index on public.members(status);

-- 민감 정보: 관리자만
create table public.member_private (
  member_id uuid primary key references public.members(id) on delete cascade,
  address   text,
  memo      text
);

create table public.member_status_log (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.members(id) on delete cascade,
  status         text not null check (status in ('재원','휴회','탈회')),
  reason         text,
  refund_amount  int not null default 0 check (refund_amount >= 0),
  effective_date date not null,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now()
);

create table public.progress (
  member_id       uuid primary key references public.members(id) on delete cascade,
  step            int not null default 0 check (step between 0 and 6),
  teacher_note    text check (length(teacher_note) <= 300),
  note_updated_at timestamptz,
  updated_by      uuid default auth.uid()
);

create table public.attendance (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.members(id) on delete cascade,
  class_id   uuid not null references public.classes(id) on delete cascade,
  date       date not null,
  status     text not null check (status in ('출석','결석','보강')),
  created_by uuid default auth.uid(),
  unique (member_id, class_id, date)
);
create index on public.attendance(date);

create table public.payments (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.members(id) on delete restrict,
  type       text not null check (type in ('신규','재등록')),
  months     int not null check (months between 1 and 24),
  amount     int not null check (amount >= 0),
  method     text not null check (method in ('카드','결제선생','이모아','제로페이','바우처','현금','계좌이체')),
  paid_at    date not null,
  teacher_id uuid references public.staff(user_id) on delete set null,
  memo       text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.payments(paid_at);

create table public.payment_links (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  url             text not null check (url ~ '^https://[^\s<>"]+$'),
  target_kind     text check (target_kind in ('child','adult')),   -- null = 전체
  target_class_id uuid references public.classes(id) on delete cascade,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create table public.notices (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (length(title) <= 100),
  body            text not null check (length(body) <= 5000),
  target          text not null default 'all' check (target in ('all','child','adult','class')),
  target_class_id uuid references public.classes(id) on delete cascade,
  pinned          boolean not null default false,
  published       boolean not null default true,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now()
);

create table public.invites (
  code       text primary key,
  member_id  uuid not null references public.members(id) on delete cascade,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  used_by    uuid references auth.users(id) on delete set null,
  used_at    timestamptz
);

create table public.guardians (
  user_id         uuid not null references auth.users(id) on delete cascade,
  member_id       uuid not null references public.members(id) on delete cascade,
  consent_version text not null,
  consent_at      timestamptz not null default now(),
  primary key (user_id, member_id)
);

create table public.redeem_attempts (
  user_id      uuid not null,
  success      boolean not null,
  attempted_at timestamptz not null default now()
);

-- ---------- 권한 판별 함수 ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff
                 where user_id = auth.uid() and role = 'admin' and active);
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and active);
$$;

create or replace function public.teaches_class(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.classes c
                 join public.staff s on s.user_id = c.teacher_id and s.active
                 where c.id = cid and c.teacher_id = auth.uid());
$$;

create or replace function public.teaches_member(mid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m
                 join public.classes c on c.id = m.class_id
                 join public.staff s on s.user_id = c.teacher_id and s.active
                 where m.id = mid and c.teacher_id = auth.uid());
$$;

-- ---------- RLS 켜기 + 기본 권한 정리 ----------
do $$
declare t text;
begin
  foreach t in array array['staff','classes','members','member_private','member_status_log',
    'progress','attendance','payments','payment_links','notices','invites','guardians','redeem_attempts']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, public', t);
  end loop;
end $$;

-- staff
create policy staff_read  on public.staff for select to authenticated using (public.is_staff());
create policy staff_admin on public.staff for all    to authenticated using (public.is_admin()) with check (public.is_admin());
-- classes
create policy classes_read  on public.classes for select to authenticated using (public.is_staff());
create policy classes_admin on public.classes for all    to authenticated using (public.is_admin()) with check (public.is_admin());
-- members (강사는 담당 반 아이만)
create policy members_read  on public.members for select to authenticated
  using (public.is_admin() or public.teaches_member(id));
create policy members_admin on public.members for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- 관리자 전용
create policy private_admin on public.member_private    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy statuslog_admin on public.member_status_log for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy payments_admin on public.payments          for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy links_admin    on public.payment_links     for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy invites_admin  on public.invites           for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- 공지: 직원 읽기, 관리자 쓰기
create policy notices_read  on public.notices for select to authenticated using (public.is_staff());
create policy notices_admin on public.notices for all    to authenticated using (public.is_admin()) with check (public.is_admin());
-- 진도·출석: 관리자 또는 담당 강사
create policy progress_rw on public.progress for all to authenticated
  using (public.is_admin() or public.teaches_member(member_id))
  with check (public.is_admin() or public.teaches_member(member_id));
create policy attendance_rw on public.attendance for all to authenticated
  using (public.is_admin() or public.teaches_class(class_id))
  with check (public.is_admin() or (public.teaches_class(class_id) and public.teaches_member(member_id)));
-- 보호자 연결: 본인 것 읽기, 관리자 읽기·삭제 (생성은 redeem_invite 함수로만)
create policy guardians_self  on public.guardians for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy guardians_admin on public.guardians for delete to authenticated using (public.is_admin());
-- redeem_attempts: 정책 없음 = 함수로만 접근

grant select, insert, update, delete on all tables in schema public to authenticated;

-- ---------- 관리자 함수 ----------
create or replace function public.admin_create_invite(p_member uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea; v text; i int;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.members where id = p_member and kind = 'child') then
    raise exception '어린이 회원만 초대코드를 만들 수 있어요';
  end if;
  update public.invites set expires_at = now() where member_id = p_member and used_at is null;
  loop
    b := extensions.gen_random_bytes(8); v := '';
    for i in 0..7 loop v := v || substr(alphabet, (get_byte(b, i) % 31) + 1, 1); end loop;
    exit when not exists (select 1 from public.invites where code = v);
  end loop;
  insert into public.invites(code, member_id) values (v, p_member);
  return v;
end $$;

create or replace function public.admin_add_payment(
  p_member uuid, p_type text, p_months int, p_amount int, p_method text,
  p_paid_at date, p_teacher uuid, p_memo text) returns date
language plpgsql security definer set search_path = '' as $$
declare v_end date; v_new date;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  insert into public.payments(member_id, type, months, amount, method, paid_at, teacher_id, memo)
  values (p_member, p_type, p_months, p_amount, p_method, p_paid_at, p_teacher, p_memo);
  select pass_end into v_end from public.members where id = p_member for update;
  v_new := (greatest(coalesce(v_end, p_paid_at - 1), p_paid_at - 1) + make_interval(months => p_months))::date;
  update public.members set pass_end = v_new,
    status = case when status = '탈회' then '재원' else status end where id = p_member;
  return v_new;
end $$;

create or replace function public.admin_change_status(
  p_member uuid, p_status text, p_reason text, p_refund int, p_date date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  insert into public.member_status_log(member_id, status, reason, refund_amount, effective_date)
  values (p_member, p_status, p_reason, coalesce(p_refund, 0), p_date);
  update public.members set status = p_status where id = p_member;
  if p_status = '탈회' then
    delete from public.guardians where member_id = p_member;     -- 학부모 앱 연결 해제
    update public.invites set expires_at = now() where member_id = p_member and used_at is null;
  end if;
end $$;

create or replace function public.admin_set_staff(p_email text, p_name text, p_role text, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_role not in ('admin','teacher') then raise exception 'bad role'; end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then raise exception '먼저 그 이메일로 회원가입(관리자 화면 로그인 → 가입)을 해야 해요'; end if;
  if v_uid = auth.uid() and (p_role <> 'admin' or not p_active) then raise exception '본인의 관리자 권한은 해제할 수 없어요'; end if;
  insert into public.staff(user_id, name, email, role, active) values (v_uid, p_name, lower(trim(p_email)), p_role, p_active)
  on conflict (user_id) do update set name = excluded.name, role = excluded.role, active = excluded.active;
end $$;

-- 엑셀 가져오기: [{kind,name,birth,gender,school,guardian_phone1,guardian_phone2,shuttle_route,class_name,first_registered,pass_end,address,memo,status}]
create or replace function public.admin_import_members(p_rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_id uuid; n int := 0; v_class uuid;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    select id into v_class from public.classes where name = nullif(r->>'class_name','') limit 1;
    insert into public.members(kind, name, birth, gender, school, guardian_phone1, guardian_phone2,
      shuttle_route, class_id, status, first_registered, pass_end)
    values (coalesce(nullif(r->>'kind',''),'child'), r->>'name', nullif(r->>'birth','')::date,
      nullif(r->>'gender',''), nullif(r->>'school',''), nullif(r->>'guardian_phone1',''),
      nullif(r->>'guardian_phone2',''), nullif(r->>'shuttle_route',''), v_class,
      coalesce(nullif(r->>'status',''),'재원'),
      coalesce(nullif(r->>'first_registered','')::date, (now() at time zone 'Asia/Seoul')::date),
      nullif(r->>'pass_end','')::date)
    returning id into v_id;
    if coalesce(r->>'address','') <> '' or coalesce(r->>'memo','') <> '' then
      insert into public.member_private(member_id, address, memo) values (v_id, nullif(r->>'address',''), nullif(r->>'memo',''));
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- 학부모 함수 ----------
create or replace function public.parent_redeem_invite(p_code text, p_consent_version text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_member uuid; v_fails int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', '로그인이 필요해요'); end if;
  if coalesce(p_consent_version, '') = '' then return jsonb_build_object('ok', false, 'error', '보호자 동의가 필요해요'); end if;
  select count(*) into v_fails from public.redeem_attempts
   where user_id = auth.uid() and not success and attempted_at > now() - interval '1 hour';
  if v_fails >= 5 then
    return jsonb_build_object('ok', false, 'error', '잘못 입력한 횟수가 많아요. 1시간 뒤 다시 시도해 주세요.');
  end if;
  select member_id into v_member from public.invites
   where code = upper(regexp_replace(p_code, '\s', '', 'g')) and used_at is null and expires_at > now()
   for update;
  if v_member is null then
    insert into public.redeem_attempts(user_id, success) values (auth.uid(), false);
    return jsonb_build_object('ok', false, 'error', '초대코드가 맞지 않거나 만료되었어요.');
  end if;
  insert into public.guardians(user_id, member_id, consent_version) values (auth.uid(), v_member, p_consent_version)
  on conflict (user_id, member_id) do update set consent_version = excluded.consent_version, consent_at = now();
  update public.invites set used_by = auth.uid(), used_at = now() where code = upper(regexp_replace(p_code, '\s', '', 'g'));
  insert into public.redeem_attempts(user_id, success) values (auth.uid(), true);
  return jsonb_build_object('ok', true);
end $$;

-- 학부모 홈: 연결된 아이만, 공개 가능한 항목만 (주소·메모·연락처·결제내역 없음)
create or replace function public.parent_home() returns jsonb
language sql stable security definer set search_path = '' as $$
  with today as (select (now() at time zone 'Asia/Seoul')::date d)
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'name', m.name, 'status', m.status, 'pass_end', m.pass_end,
    'shuttle_route', m.shuttle_route,
    'class', case when c.id is null then null else jsonb_build_object(
       'name', c.name, 'level', c.level, 'days', c.days, 'start_time', to_char(c.start_time, 'HH24:MI'),
       'teacher', s.name) end,
    'step', coalesce(p.step, 0), 'teacher_note', p.teacher_note, 'note_updated_at', p.note_updated_at,
    'attendance', (select coalesce(jsonb_agg(jsonb_build_object('date', a.date, 'status', a.status) order by a.date), '[]'::jsonb)
                   from public.attendance a, today
                   where a.member_id = m.id and a.date >= date_trunc('month', today.d)::date),
    'pay_url', (select l.url from public.payment_links l
                where l.active and (l.target_class_id = m.class_id
                   or (l.target_class_id is null and (l.target_kind is null or l.target_kind = m.kind)))
                order by (l.target_class_id is not null) desc, (l.target_kind is not null) desc, l.created_at desc limit 1)
  ) order by m.name), '[]'::jsonb)
  from public.guardians g
  join public.members m on m.id = g.member_id and m.status <> '탈회'
  left join public.classes c on c.id = m.class_id
  left join public.staff s on s.user_id = c.teacher_id
  left join public.progress p on p.member_id = m.id
  where g.user_id = auth.uid();
$$;

create or replace function public.parent_notices() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body,
           'pinned', n.pinned, 'created_at', n.created_at) order by n.pinned desc, n.created_at desc), '[]'::jsonb)
  from (select * from public.notices n
        where n.published and exists (
          select 1 from public.guardians g join public.members m on m.id = g.member_id
          where g.user_id = auth.uid() and m.status <> '탈회'
            and (n.target = 'all' or (n.target = m.kind) or (n.target = 'class' and n.target_class_id = m.class_id)))
        order by n.pinned desc, n.created_at desc limit 30) n;
$$;

-- 내가 누구인지 (화면 분기용)
create or replace function public.whoami() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'staff', (select jsonb_build_object('name', name, 'role', role) from public.staff where user_id = auth.uid() and active),
    'children', (select count(*) from public.guardians where user_id = auth.uid()));
$$;

-- 함수 실행 권한: 로그인한 사람만 (각 함수 안에서 다시 권한 확인)
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public revoke all on tables from anon;
