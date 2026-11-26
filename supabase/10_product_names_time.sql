-- 변경 (2026-11-26): 저장된 매출 이름에서 반 이름(초급·중급·상급 등)을 '요일 시간'으로 바꿈
update public.payments p set product_name = x.lbl || ' ' || p.months || '개월'
from (
  select m.id as mid,
    (select string_agg((array['월','화','수','목','금','토','일'])[d + 1], '' order by d) from unnest(c.days) d)
    || ' ' || (case when extract(hour from c.start_time)::int > 12 then extract(hour from c.start_time)::int - 12 else extract(hour from c.start_time)::int end) || '시'
    || (case when extract(minute from c.start_time)::int > 0 then ' ' || lpad(extract(minute from c.start_time)::int::text, 2, '0') || '분' else '' end) as lbl
  from public.members m join public.classes c on c.id = m.class_id
) x
where x.mid = p.member_id and p.months > 0 and p.product_name ~ '(초급|중급|상급|단체강습|토요)';
