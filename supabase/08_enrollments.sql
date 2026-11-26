-- 변경 (2026-11-26): 한 아이가 여러 반(다른 요일·시간·선생님)에 등록 가능
-- members.class_id 는 '대표 반'(결제·담당 기준)으로 남겨 두고, 실제 수강 반은 enrollments 에 저장
create table if not exists public.enrollments (
  member_id  uuid not null references public.members(id) on delete cascade,
  class_id   uuid not null references public.classes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, class_id)
);
create index if not exists enrollments_class_idx on public.enrollments(class_id);
alter table public.enrollments enable row level security;
revoke all on public.enrollments from anon, public;
grant select, insert, update, delete on public.enrollments to authenticated;
drop policy if exists enroll_read on public.enrollments;
drop policy if exists enroll_admin on public.enrollments;
create policy enroll_read  on public.enrollments for select to authenticated using (public.is_staff());
create policy enroll_admin on public.enrollments for all    to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.enrollments(member_id, class_id)
select id, class_id from public.members where class_id is not null
on conflict do nothing;

-- 학부모 홈: 수강 반 여러 개
create or replace function public.parent_home() returns jsonb
language sql stable security definer set search_path = '' as $$
  with today as (select (now() at time zone 'Asia/Seoul')::date d)
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'name', m.name, 'status', m.status, 'pass_end', m.pass_end,
    'shuttle_route', m.shuttle_route,
    'classes', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', c.name, 'level', c.level, 'days', c.days, 'start_time', to_char(c.start_time, 'HH24:MI'),
        'teacher', s.name) order by c.days[1], c.start_time), '[]'::jsonb)
      from public.enrollments e join public.classes c on c.id = e.class_id and c.active
      left join public.staff s on s.user_id = c.teacher_id
      where e.member_id = m.id),
    'step', coalesce(p.step, 0), 'teacher_note', p.teacher_note, 'note_updated_at', p.note_updated_at,
    'note_teacher', (select s2.name from public.staff s2 where s2.user_id = p.updated_by),
    'attendance', (select coalesce(jsonb_agg(jsonb_build_object('date', a.date, 'status', a.status) order by a.date), '[]'::jsonb)
                   from public.attendance a, today
                   where a.member_id = m.id and a.date >= date_trunc('month', today.d)::date),
    'pay_url', (select l.url from public.payment_links l
                where l.active and (l.target_class_id is null
                   or l.target_class_id in (select e.class_id from public.enrollments e where e.member_id = m.id))
                  and (l.target_kind is null or l.target_kind = m.kind)
                order by (l.target_class_id is not null) desc, l.created_at desc limit 1)
  ) order by m.name), '[]'::jsonb)
  from public.guardians g
  join public.members m on m.id = g.member_id and m.status <> '탈회'
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
            and (n.target = 'all' or n.target = m.kind
                 or (n.target = 'class' and exists (select 1 from public.enrollments e where e.member_id = m.id and e.class_id = n.target_class_id))))
        order by n.pinned desc, n.created_at desc limit 30) n;
$$;

-- 엑셀 가져오기: class_name 에 여러 반을 , / · 로 구분해서 넣을 수 있음
create or replace function public.admin_import_members(p_rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_id uuid; n int := 0; v_first uuid; cname text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_first := null;
    for cname in select trim(x) from regexp_split_to_table(coalesce(r->>'class_name', ''), '[,/·]') x where trim(x) <> '' loop
      if v_first is null then select id into v_first from public.classes where name = cname and active limit 1; end if;
    end loop;
    insert into public.members(kind, name, birth, gender, school, guardian_phone1, guardian_phone2,
      shuttle_route, class_id, status, first_registered, pass_end)
    values (coalesce(nullif(r->>'kind',''),'child'), r->>'name', nullif(r->>'birth','')::date,
      nullif(r->>'gender',''), nullif(r->>'school',''), nullif(r->>'guardian_phone1',''),
      nullif(r->>'guardian_phone2',''), nullif(r->>'shuttle_route',''), v_first,
      coalesce(nullif(r->>'status',''),'재원'),
      coalesce(nullif(r->>'first_registered','')::date, (now() at time zone 'Asia/Seoul')::date),
      nullif(r->>'pass_end','')::date)
    returning id into v_id;
    insert into public.enrollments(member_id, class_id)
    select v_id, c.id from public.classes c
    where c.active and c.name in (select trim(x) from regexp_split_to_table(coalesce(r->>'class_name', ''), '[,/·]') x where trim(x) <> '')
    on conflict do nothing;
    if coalesce(r->>'address','') <> '' or coalesce(r->>'memo','') <> '' then
      insert into public.member_private(member_id, address, memo) values (v_id, nullif(r->>'address',''), nullif(r->>'memo',''));
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
