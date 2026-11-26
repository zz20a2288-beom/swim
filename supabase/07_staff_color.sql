-- 변경 (2026-11-26): 시간표에서 선생님별 색깔 구분
alter table public.staff add column if not exists color text check (color ~ '^#[0-9A-Fa-f]{6}$');
