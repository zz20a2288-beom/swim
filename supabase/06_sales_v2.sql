-- 변경 (2026-11-26): 매출 화면 개편 — 매출 이름·유형·판매금액·미수금·결제담당자·환불, 결제수단 '서비스'
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check
  check (method in ('카드','결제선생','이모아','제로페이','바우처','현금','계좌이체','서비스'));
alter table public.payments drop constraint if exists payments_months_check;
alter table public.payments add constraint payments_months_check check (months between 0 and 24);

alter table public.payments
  add column if not exists product_name  text check (length(product_name) <= 60),
  add column if not exists sale_type     text not null default '수강권' check (sale_type in ('수강권','특강','용품','기타')),
  add column if not exists list_price    int check (list_price >= 0),
  add column if not exists unpaid        int not null default 0 check (unpaid >= 0),
  add column if not exists handled_by    uuid references public.staff(user_id) on delete set null,
  add column if not exists refund_amount int not null default 0 check (refund_amount >= 0),
  add column if not exists refunded_at   date,
  add column if not exists refund_reason text;

update public.payments set product_name = coalesce(product_name, '수강권 ' || months || '개월'), list_price = coalesce(list_price, amount);

create or replace function public.admin_add_sale(
  p_member uuid, p_type text, p_sale_type text, p_product text, p_months int,
  p_list_price int, p_amount int, p_unpaid int, p_method text, p_paid_at date,
  p_handled_by uuid, p_memo text) returns date
language plpgsql security definer set search_path = '' as $$
declare v_end date; v_new date;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  insert into public.payments(member_id, type, sale_type, product_name, months, list_price, amount, unpaid, method, paid_at, teacher_id, handled_by, memo)
  values (p_member, p_type, p_sale_type, nullif(trim(p_product), ''), p_months, p_list_price, p_amount, coalesce(p_unpaid, 0), p_method, p_paid_at,
          (select c.teacher_id from public.members m join public.classes c on c.id = m.class_id where m.id = p_member),
          coalesce(p_handled_by, auth.uid()), p_memo);
  select pass_end into v_end from public.members where id = p_member for update;
  if p_months > 0 then
    v_new := (greatest(coalesce(v_end, p_paid_at - 1), p_paid_at - 1) + make_interval(months => p_months))::date;
    update public.members set pass_end = v_new, status = case when status = '탈회' then '재원' else status end where id = p_member;
    return v_new;
  end if;
  return v_end;
end $$;

create or replace function public.admin_refund_sale(p_id uuid, p_amount int, p_date date, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_amount < 0 or p_amount > (select amount from public.payments where id = p_id) then raise exception '환불 금액이 결제 금액보다 클 수 없어요'; end if;
  update public.payments set refund_amount = p_amount, refunded_at = case when p_amount > 0 then p_date end, refund_reason = nullif(trim(p_reason), '') where id = p_id;
end $$;

create or replace function public.admin_settle_unpaid(p_id uuid, p_unpaid int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.payments set unpaid = greatest(0, p_unpaid) where id = p_id;
end $$;

revoke execute on function public.admin_add_sale(uuid,text,text,text,int,int,int,int,text,date,uuid,text) from public, anon;
revoke execute on function public.admin_refund_sale(uuid,int,date,text) from public, anon;
revoke execute on function public.admin_settle_unpaid(uuid,int) from public, anon;
grant execute on function public.admin_add_sale(uuid,text,text,text,int,int,int,int,text,date,uuid,text) to authenticated;
grant execute on function public.admin_refund_sale(uuid,int,date,text) to authenticated;
grant execute on function public.admin_settle_unpaid(uuid,int) to authenticated;
