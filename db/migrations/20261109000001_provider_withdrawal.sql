-- ============================================================
-- اعتذار المكتب عن طلب مُرسى عليه: إلغاء مع استرداد كامل للعميل، ويُحتسب في سجل المكتب
-- ============================================================

alter table public.orders drop constraint orders_settlement_check;
alter table public.orders add constraint orders_settlement_check check (settlement in (
  'completed', 'dispute_provider', 'dispute_full_refund', 'dispute_partial_refund',
  'cancelled_after_start', 'refunded_before_start', 'provider_withdrawal'
));

create table public.provider_withdrawals (
  request_id uuid primary key references public.service_requests (id) on delete cascade,
  provider_id uuid not null references public.providers (id) on delete restrict,
  reason text not null check (char_length(reason) between 5 and 500),
  -- الحالة التي اعتذر فيها المكتب، والمبلغ المسترد للعميل (0 إن لم يكن مدفوعاً)
  from_status public.request_status not null,
  refunded_halalas integer not null default 0 check (refunded_halalas >= 0),
  created_at timestamptz not null default now()
);

create index provider_withdrawals_provider_idx on public.provider_withdrawals (provider_id, created_at);

alter table public.provider_withdrawals enable row level security;
revoke all on public.provider_withdrawals from public, anon, authenticated;
grant select on public.provider_withdrawals to authenticated;

create policy "provider_withdrawals: provider, request members, admin"
  on public.provider_withdrawals for select to authenticated
  using (
    provider_id = (select public.current_provider_id())
    or (select public.is_request_member(request_id))
    or (select public.is_admin())
  );

comment on table public.provider_withdrawals is
  'اعتذارات المكاتب عن طلبات مُرساة عليها. تُكتب عبر provider_withdraw فقط.';

-- ============================================================
-- provider_withdraw: تُستدعى من الخادم بعد نجاح الاسترداد في البوابة (إن كان الطلب مدفوعاً).
-- كل شيء في معاملة واحدة: تسوية الضمان باسترداد كامل، الإلغاء، تسجيل الاعتذار، وإشعار العميل.
-- ============================================================
create function public.provider_withdraw(
  p_request_id uuid,
  p_reason text,
  p_refund_ref text,
  p_actor_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.service_requests;
  v_provider uuid;
  v_order public.orders;
  v_reason text := trim(coalesce(p_reason, ''));
  v_refund integer := 0;
  v_service text;
begin
  select * into v_request from public.service_requests where id = p_request_id for update;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  if v_request.status not in ('awarded_unpaid', 'paid', 'awaiting_client', 'in_progress') then
    raise exception 'invalid_status' using errcode = '55000';
  end if;

  v_provider := public.awarded_provider_id(p_request_id);
  if v_provider is null or not exists (
    select 1 from public.providers where id = v_provider and profile_id = p_actor_id
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select * into v_order from public.orders where request_id = p_request_id for update;
  if v_order.payment_status = 'paid' then
    v_refund := v_order.total_paid_halalas;
    perform public.settle_order_ledger(v_order.id, v_refund, p_refund_ref, 'provider_withdrawal');
  end if;

  insert into public.provider_withdrawals (request_id, provider_id, reason, from_status, refunded_halalas)
  values (p_request_id, v_provider, v_reason, v_request.status, v_refund);

  perform public.transition_request_as(p_request_id, 'cancelled', 'system', p_actor_id,
    left('اعتذر المكتب عن الطلب: ' || v_reason, 500));

  select name_ar into v_service from public.service_types where id = v_request.service_type_id;
  perform public.notify_request_members(p_request_id, 'provider_withdrew',
    'اعتذر المكتب عن طلبك',
    case when v_refund > 0
      then 'اعتذر المكتب عن تنفيذ طلب ' || v_service || '، واستُرد لك المبلغ كاملاً ('
           || public.format_sar(v_refund) || '). يمكنك نشر طلب جديد.'
      else 'اعتذر المكتب عن تنفيذ طلب ' || v_service || '. يمكنك نشر طلب جديد.'
    end);
  return v_refund;
end;
$$;

revoke all on function public.provider_withdraw from public, anon, authenticated;
