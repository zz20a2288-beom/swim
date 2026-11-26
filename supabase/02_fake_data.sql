-- 테스트용 가짜 데이터 (실제 개인정보 아님). 실제 엑셀을 넣기 전에 03_clear_fake_data.sql로 지웁니다.
insert into public.classes (name, kind, level, days, start_time, capacity) values
 ('성인 중급',   'adult','중급','{1,3}',  '06:30', 18),
 ('성인 초급',   'adult','초급','{0,2}',  '10:00', 20),
 ('초급 A',     'child','초급','{1,3}',  '15:00', 5),
 ('초급 B',     'child','초급','{1,3}',  '16:00', 5),
 ('중급 A',     'child','중급','{0,2,4}','16:00', 5),
 ('토요 초급',   'child','초급','{5}',    '10:00', 5),
 ('상급',       'child','상급','{0,2,4}','17:00', 5),
 ('중급 B',     'child','중급','{1,3}',  '17:00', 5),
 ('단체강습',    'child','초급','{1,3}',  '18:00', 15),
 ('성인 상급',   'adult','상급','{0,2,4}','20:00', 15);

with names(n, kind, cls, g, route) as (values
 ('테스트하늘','child','초급 B','여','금오'), ('테스트서준','child','중급 A','남','신곡'),
 ('테스트윤아','child','단체강습','여','장암'), ('테스트도윤','child','상급','남','호원'),
 ('테스트서아','child','초급 A','여','용현'), ('테스트지호','child','상급','남','의정부1동'),
 ('테스트하준','child','초급 B','남','신곡'), ('테스트지안','child','초급 A','여','금오'),
 ('테스트시우','child','중급 B','남',null), ('테스트유나','child','중급 A','여','장암'),
 ('테스트민재','child','단체강습','남','호원'), ('테스트소율','child','토요 초급','여',null),
 ('테스트지우','adult','성인 중급','여',null), ('테스트민호','adult','성인 초급','남',null),
 ('테스트다은','adult','성인 상급','여',null), ('테스트현우','adult','성인 중급','남',null))
insert into public.members (kind, name, birth, gender, school, guardian_phone1, guardian_phone2, shuttle_route, class_id, first_registered, pass_end)
select kind, n,
  case when kind='child' then date '2015-01-01' + (row_number() over () * 211)::int else date '1985-05-05' end,
  g, case when kind='child' then '테스트초' end,
  '010-0000-' || lpad((row_number() over ())::text, 4, '0'), null, route,
  (select id from public.classes c where c.name = cls),
  date '2025-03-01' + (row_number() over () * 17)::int,
  (now() at time zone 'Asia/Seoul')::date + ((row_number() over () * 5) % 40)::int - 3
from names;

insert into public.member_private (member_id, address, memo)
select id, '테스트시 테스트동 (가짜 주소)', '내부 메모 테스트 — 학부모에게 보이면 안 됨' from public.members;

insert into public.progress (member_id, step, teacher_note, note_updated_at)
select id, (abs(hashtext(name)) % 5), '테스트 한마디: 이번 주 킥 연습을 잘했어요.', now() from public.members where kind='child';

-- 이번 달 출석 (수업 요일에 맞춰)
insert into public.attendance (member_id, class_id, date, status)
select m.id, c.id, d::date,
  case when abs(hashtext(m.name || d::text)) % 10 = 0 then '결석' when abs(hashtext(m.name || d::text)) % 10 = 1 then '보강' else '출석' end
from public.members m join public.classes c on c.id = m.class_id,
  generate_series(date_trunc('month', now() at time zone 'Asia/Seoul'), (now() at time zone 'Asia/Seoul')::date, interval '1 day') d
where ((extract(isodow from d)::int - 1) = any (c.days));

-- 최근 6개월 결제
insert into public.payments (member_id, type, months, amount, method, paid_at)
select m.id, case when k = 0 then '신규' else '재등록' end, 1,
  case when m.kind='child' then 230000 else 160000 end,
  (array['카드','결제선생','이모아','제로페이','바우처','현금','계좌이체'])[1 + abs(hashtext(m.name || k::text)) % 7],
  (date_trunc('month', now() at time zone 'Asia/Seoul') - make_interval(months => k))::date + (abs(hashtext(m.name)) % 25)
from public.members m, generate_series(0, 5) k;

insert into public.payment_links (name, url, target_kind) values
 ('어린이 수강료 (테스트 링크)', 'https://example.com/test-pay-child', 'child'),
 ('성인 수강료 (테스트 링크)',  'https://example.com/test-pay-adult', 'adult');

insert into public.notices (title, body, target, pinned) values
 ('[테스트] 12월 겨울방학특강 접수 안내', '테스트 공지입니다. 12월 1일 오전 10시부터 온라인 선착순 접수가 시작됩니다.', 'child', true),
 ('[테스트] 셔틀 노선 확장 안내', '테스트 공지입니다. 호원·용현 노선이 추가되었습니다.', 'all', false);
