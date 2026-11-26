-- 변경 (2026-11-26): 학부모 앱에도 선생님별 색깔 표시 (관리자 시간표와 같은 색)
create or replace function public.staff_color(p_uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when p_uid is null then '#EEF2F6' else coalesce(
    (select color from public.staff where user_id = p_uid),
    (select (array['#4FC3F7','#F9C6EE','#B9A7D9','#C5DB9E','#F8C08F','#FFE38A','#8FD3C7'])[((rn - 1) % 7) + 1]
       from (select user_id, row_number() over (order by name) rn from public.staff) x where x.user_id = p_uid),
    '#D9D9D9') end;
$$;

create or replace function public.parent_home() returns jsonb
language sql stable security definer set search_path = '' as $$
  with today as (select (now() at time zone 'Asia/Seoul')::date d)
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'name', m.name, 'status', m.status, 'pass_end', m.pass_end,
    'shuttle_route', m.shuttle_route,
    'classes', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', c.name, 'level', c.level, 'days', c.days, 'start_time', to_char(c.start_time, 'HH24:MI'),
        'teacher', s.name, 'color', public.staff_color(c.teacher_id)) order by c.days[1], c.start_time), '[]'::jsonb)
      from public.enrollments e join public.classes c on c.id = e.class_id and c.active
      left join public.staff s on s.user_id = c.teacher_id
      where e.member_id = m.id),
    'step', coalesce(p.step, 0), 'teacher_note', p.teacher_note, 'note_updated_at', p.note_updated_at,
    'note_teacher', (select s2.name from public.staff s2 where s2.user_id = p.updated_by),
    'attendance', (select coalesce(jsonb_agg(jsonb_build_object('date', a.date, 'status', a.status,
                     'teacher', (select s3.name from public.staff s3 where s3.user_id = ca.teacher_id),
                     'color', public.staff_color(ca.teacher_id)) order by a.date), '[]'::jsonb)
                   from public.attendance a join public.classes ca on ca.id = a.class_id, today
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


revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
