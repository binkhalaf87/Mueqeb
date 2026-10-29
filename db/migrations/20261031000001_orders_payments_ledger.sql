-- المرحلة 4: الطلبات المالية (orders)، المدفوعات، دفتر الحسابات (append-only)
-- كل المبالغ بالهللة (integer/bigint). النسب تُثبّت في الطلب بنقاط الأساس (1% = 100).

-- ============================================================
-- الأنواع
-- ============================================================
create type public.order_payment_status as enum ('unpaid', 'paid', 'refunded');
create type public.payment_status as enum ('initiated', 'paid', 'failed', 'refunded');
create type public.ledger_account as enum (
  'client',
  'escrow',
  'platform_revenue',
  'provider_payable',
  'provider_paid'
);

-- ============================================================
-- حساب المبالغ (مطابق لـ src/lib/payments/amounts.ts)
-- التقريب: نصف هللة فأكثر يُقرّب للأعلى، بحساب صحيح بلا كسور
-- ============================================================
create function public.pct_to_bps(p_pct jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select round((p_pct #>> '{}')::numeric * 100)::integer;
$$;

create function public.round_bps(p_amount bigint, p_bps integer)
returns bigint
language sql
immutable
set search_path = ''
as $$
  -- (amount × bps + 5000) ÷ 10000 بقسمة صحيحة = تقريب نصف للأعلى (المبالغ والنسب موجبة)
  select (p_amount * p_bps + 5000) / 10000;
$$;

-- ============================================================
-- orders: الجانب المالي للطلب بعد الترسية (طلب واحد لكل service_request)
-- ============================================================
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.service_requests (id) on delete restrict,
  bid_id uuid not null references public.bids (id) on delete restrict,
  provider_service_id uuid references public.provider_services (id) on delete set null,
  provider_id uuid not null references public.providers (id) on delete restrict,
  fee_halalas integer not null check (fee_halalas > 0),
  client_fee_bps integer not null check (client_fee_bps between 0 and 10000),
  provider_commission_bps integer not null check (provider_commission_bps between 0 and 10000),
  client_fee_halalas integer not null check (client_fee_halalas >= 0),
  provider_commission_halalas integer not null check (provider_commission_halalas >= 0),
  provider_net_halalas integer not null check (provider_net_halalas >= 0),
  total_paid_halalas integer not null check (total_paid_halalas > 0),
  expected_gov_fees_halalas integer not null default 0 check (expected_gov_fees_halalas >= 0),
  payment_status public.order_payment_status not null default 'unpaid',
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint orders_amounts_consistent check (
    total_paid_halalas = fee_halalas + client_fee_halalas
    and provider_net_halalas = fee_halalas - provider_commission_halalas
  )
);

comment on column public.orders.total_paid_halalas is
  'ما يدفعه العميل للمنصة = أتعاب المزوّد + رسم الخدمة (الرسوم الحكومية خارج المنصة)';

create index orders_provider_idx on public.orders (provider_id);

-- ============================================================
-- payments: محاولة دفع لكل توجيه إلى البوابة
-- ============================================================
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  gateway text not null check (gateway in ('moyasar', 'mock')),
  provider_ref text not null,
  gateway_payment_id text,
  amount_halalas integer not null check (amount_halalas > 0),
  currency text not null default 'SAR' check (currency = 'SAR'),
  status public.payment_status not null default 'initiated',
  failure_reason text,
  refund_ref text,
  raw_webhook jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz,
  unique (gateway, provider_ref)
);

create index payments_order_idx on public.payments (order_id);

-- سجل أحداث البوابة لمنع المعالجة المكررة (idempotency)
create table public.payment_webhook_events (
  gateway text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  payload jsonb not null,
  outcome text,
  primary key (gateway, event_id)
);

-- ============================================================
-- ledger_entries: دفتر قيد مزدوج append-only
-- كل قيد (journal) متوازن: مجموع المدين = مجموع الدائن
-- تحويل من حساب A إلى B = دائن A ومدين B
-- ============================================================
create table public.ledger_entries (
  id bigint generated always as identity primary key,
  journal_id uuid not null,
  order_id uuid not null references public.orders (id) on delete restrict,
  payment_id uuid references public.payments (id) on delete restrict,
  account public.ledger_account not null,
  debit_halalas bigint not null default 0 check (debit_halalas >= 0),
  credit_halalas bigint not null default 0 check (credit_halalas >= 0),
  description text not null check (char_length(description) between 1 and 300),
  reverses_journal_id uuid,
  created_at timestamptz not null default now(),
  constraint ledger_one_side check ((debit_halalas = 0) <> (credit_halalas = 0))
);

create index ledger_entries_order_idx on public.ledger_entries (order_id);
create index ledger_entries_journal_idx on public.ledger_entries (journal_id);

-- منع أي تعديل أو حذف (حتى من مالك القاعدة): التصحيح بقيد عكسي فقط
create function public.ledger_block_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'ledger_is_append_only' using errcode = '42501',
    hint = 'صحّح بقيد عكسي جديد';
end;
$$;

create trigger ledger_no_update_delete
  before update or delete on public.ledger_entries
  for each row execute function public.ledger_block_mutation();

create trigger ledger_no_truncate
  before truncate on public.ledger_entries
  for each statement execute function public.ledger_block_mutation();

-- التحقق من توازن القيد عند نهاية المعاملة
create function public.ledger_check_journal_balanced()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_diff bigint;
begin
  select coalesce(sum(debit_halalas), 0) - coalesce(sum(credit_halalas), 0) into v_diff
  from public.ledger_entries where journal_id = new.journal_id;
  if v_diff <> 0 then
    raise exception 'ledger_journal_unbalanced' using errcode = '23514',
      detail = format('journal %s diff %s', new.journal_id, v_diff);
  end if;
  return null;
end;
$$;

create constraint trigger ledger_journal_balanced
  after insert on public.ledger_entries
  deferrable initially deferred
  for each row execute function public.ledger_check_journal_balanced();

-- إدراج قيد مزدوج (تحويل) — الطريقة الوحيدة للكتابة في الدفتر
create function public.ledger_transfer(
  p_order_id uuid,
  p_payment_id uuid,
  p_from public.ledger_account,
  p_to public.ledger_account,
  p_amount bigint,
  p_description text,
  p_reverses uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_journal uuid := gen_random_uuid();
begin
  if p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  insert into public.ledger_entries
    (journal_id, order_id, payment_id, account, debit_halalas, credit_halalas, description, reverses_journal_id)
  values
    (v_journal, p_order_id, p_payment_id, p_from, 0, p_amount, p_description, p_reverses),
    (v_journal, p_order_id, p_payment_id, p_to, p_amount, 0, p_description, p_reverses);
  return v_journal;
end;
$$;

-- ============================================================
-- إنشاء الطلب المالي تلقائياً عند الترسية بالنسب الحالية (تُثبّت فيه)
-- ============================================================
create function public.create_order_for_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.service_requests;
  v_bid public.bids;
  v_client_bps integer;
  v_commission_bps integer;
  v_client_fee bigint;
  v_commission bigint;
  v_listed_id uuid;
  v_order_id uuid;
begin
  select id into v_order_id from public.orders where request_id = p_request_id;
  if found then
    return v_order_id;
  end if;

  select * into v_request from public.service_requests where id = p_request_id;
  select * into v_bid from public.bids where id = v_request.awarded_bid_id;
  if v_bid.id is null then
    raise exception 'no_awarded_bid' using errcode = '55000';
  end if;

  select public.pct_to_bps(value) into v_client_bps from public.settings where key = 'client_fee_pct';
  select public.pct_to_bps(value) into v_commission_bps from public.settings where key = 'provider_commission_pct';
  v_client_fee := public.round_bps(v_bid.fee_halalas, v_client_bps);
  v_commission := public.round_bps(v_bid.fee_halalas, v_commission_bps);

  if v_request.mode = 'direct_listed' then
    select id into v_listed_id from public.provider_services
    where provider_id = v_bid.provider_id and service_type_id = v_request.service_type_id;
  end if;

  insert into public.orders (
    request_id, bid_id, provider_service_id, provider_id, fee_halalas,
    client_fee_bps, provider_commission_bps, client_fee_halalas, provider_commission_halalas,
    provider_net_halalas, total_paid_halalas, expected_gov_fees_halalas
  ) values (
    p_request_id, v_bid.id, v_listed_id, v_bid.provider_id, v_bid.fee_halalas,
    v_client_bps, v_commission_bps, v_client_fee, v_commission,
    v_bid.fee_halalas - v_commission, v_bid.fee_halalas + v_client_fee, v_bid.expected_gov_fees_halalas
  )
  returning id into v_order_id;

  return v_order_id;
end;
$$;

create function public.on_request_awarded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.create_order_for_request(new.id);
  return new;
end;
$$;

create trigger service_requests_create_order
  after update of status on public.service_requests
  for each row
  when (new.status = 'awarded_unpaid' and old.status is distinct from 'awarded_unpaid')
  execute function public.on_request_awarded();

-- الطلبات المُرساة قبل هذه المرحلة
select public.create_order_for_request(id)
from public.service_requests where status = 'awarded_unpaid';

-- ============================================================
-- آلة الحالات: الإلغاء قبل بدء التنفيذ متاح للعميل (مع استرداد كامل)
-- ============================================================
create or replace function public.transition_request(
  p_request_id uuid,
  p_to public.request_status,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_request public.service_requests;
  v_actor text;
  v_allowed text[];
begin
  select * into v_request from public.service_requests where id = p_request_id for update;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  if v_uid is null then
    if coalesce(auth.role(), '') in ('anon', 'authenticated') then
      raise exception 'not_authenticated' using errcode = '28000';
    end if;
    v_actor := 'system';
  elsif public.is_admin() then
    v_actor := 'admin';
  elsif public.is_request_member(p_request_id) then
    v_actor := 'requester';
  elsif public.is_awarded_provider(p_request_id) then
    v_actor := 'provider';
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_allowed := case v_request.status::text || '>' || p_to::text
    when 'draft>open'                    then array['requester', 'system']
    when 'draft>cancelled'               then array['requester', 'admin', 'system']
    when 'open>awarded_unpaid'           then array['requester', 'system']
    when 'open>cancelled'                then array['requester', 'admin']
    when 'open>expired'                  then array['system']
    when 'awarded_unpaid>paid'           then array['system']
    when 'awarded_unpaid>cancelled'      then array['requester', 'admin', 'system']
    when 'awarded_unpaid>expired'        then array['system']
    when 'paid>awaiting_client'          then array['provider', 'system']
    -- الإلغاء بعد الدفع يتم عبر النظام فقط لأنه مشروط باسترداد ناجح من البوابة
    when 'paid>cancelled'                then array['system']
    when 'awaiting_client>in_progress'   then array['provider']
    when 'awaiting_client>cancelled'     then array['system']
    when 'in_progress>delivered'         then array['provider']
    when 'in_progress>disputed'          then array['requester']
    when 'delivered>completed'           then array['requester', 'system', 'admin']
    when 'delivered>disputed'            then array['requester']
    when 'disputed>resolved'             then array['admin']
    else null
  end;

  if v_allowed is null then
    raise exception 'invalid_transition' using errcode = '55000',
      detail = format('%s -> %s', v_request.status, p_to);
  end if;
  if not (v_actor = any (v_allowed)) then
    raise exception 'forbidden_transition' using errcode = '42501',
      detail = format('%s -> %s by %s', v_request.status, p_to, v_actor);
  end if;

  if p_to = 'awarded_unpaid' and v_request.awarded_bid_id is null then
    raise exception 'no_awarded_bid' using errcode = '55000';
  end if;
  -- لا يُلغى طلب مدفوع إلا بعد تسجيل الاسترداد
  if p_to = 'cancelled' and exists (
    select 1 from public.orders where request_id = p_request_id and payment_status = 'paid'
  ) then
    raise exception 'refund_required' using errcode = '55000';
  end if;

  update public.service_requests
  set status = p_to,
      published_at = case when p_to = 'open' then now() else published_at end
  where id = p_request_id;

  insert into public.order_events (request_id, from_status, to_status, actor_id, actor_role, note)
  values (p_request_id, v_request.status, p_to, v_uid, v_actor, left(nullif(trim(p_note), ''), 500));
end;
$$;

-- ============================================================
-- تسجيل محاولة دفع (من الخادم بمفتاح الخدمة بعد إنشاء جلسة الدفع في البوابة)
-- ============================================================
create function public.register_payment_attempt(
  p_order_id uuid,
  p_gateway text,
  p_provider_ref text,
  p_amount_halalas integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_status public.request_status;
  v_payment_id uuid;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  select status into v_status from public.service_requests where id = v_order.request_id;
  if v_order.payment_status <> 'unpaid' or v_status <> 'awarded_unpaid' then
    raise exception 'order_not_payable' using errcode = '55000';
  end if;
  if p_amount_halalas <> v_order.total_paid_halalas then
    raise exception 'amount_mismatch' using errcode = '22023';
  end if;

  insert into public.payments (order_id, gateway, provider_ref, amount_halalas)
  values (p_order_id, p_gateway, p_provider_ref, p_amount_halalas)
  returning id into v_payment_id;
  return v_payment_id;
end;
$$;

-- ============================================================
-- record_payment_result: معالجة نتيجة دفع من البوابة (webhook أو تحقق العودة)
-- idempotent: الحدث المكرر أو الدفعة المسجّلة مسبقاً لا تُنشئ قيوداً جديدة
-- النتيجة: processed | duplicate | ignored | failed | refund_required
-- ============================================================
create function public.record_payment_result(
  p_gateway text,
  p_event_id text,
  p_provider_ref text,
  p_status text,
  p_amount_halalas integer,
  p_currency text,
  p_gateway_payment_id text,
  p_raw jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_order public.orders;
  v_request_status public.request_status;
begin
  -- 1) الحدث نفسه لا يُعالج مرتين
  if p_event_id is not null then
    insert into public.payment_webhook_events (gateway, event_id, payload)
    values (p_gateway, p_event_id, coalesce(p_raw, '{}'::jsonb))
    on conflict do nothing;
    if not found then
      return 'duplicate';
    end if;
  end if;

  select * into v_payment from public.payments
  where gateway = p_gateway and provider_ref = p_provider_ref
  for update;
  if not found then
    return 'ignored';
  end if;

  select * into v_order from public.orders where id = v_payment.order_id for update;

  if p_status = 'failed' then
    if v_payment.status = 'initiated' then
      update public.payments
      set status = 'failed', failure_reason = left(coalesce(p_raw #>> '{data,source,message}', p_raw #>> '{message}', 'declined'), 300),
          raw_webhook = p_raw, gateway_payment_id = coalesce(p_gateway_payment_id, gateway_payment_id)
      where id = v_payment.id;
    end if;
    return 'failed';
  end if;

  if p_status <> 'paid' then
    return 'ignored';
  end if;

  -- 2) الدفعة نفسها مسجّلة مسبقاً كمدفوعة
  if v_payment.status in ('paid', 'refunded') then
    return 'duplicate';
  end if;

  -- 3) المبلغ والعملة يجب أن يطابقا الطلب تماماً
  if p_amount_halalas is distinct from v_payment.amount_halalas
     or p_amount_halalas is distinct from v_order.total_paid_halalas
     or upper(coalesce(p_currency, '')) <> 'SAR' then
    update public.payments
    set status = 'failed', failure_reason = 'amount_mismatch', raw_webhook = p_raw
    where id = v_payment.id;
    return 'failed';
  end if;

  update public.payments
  set status = 'paid', paid_at = now(), raw_webhook = p_raw,
      gateway_payment_id = coalesce(p_gateway_payment_id, gateway_payment_id)
  where id = v_payment.id;

  -- قيد الدفع: العميل → الضمان (escrow)
  perform public.ledger_transfer(
    v_order.id, v_payment.id, 'client', 'escrow', v_payment.amount_halalas,
    'دفع العميل: محفوظ في الضمان حتى تأكيد الإنجاز'
  );

  select status into v_request_status from public.service_requests where id = v_order.request_id;

  -- دفعة ثانية لطلب مدفوع، أو دفع بعد إلغاء الطلب: تُسجَّل ثم تُسترد
  if v_order.payment_status <> 'unpaid' or v_request_status <> 'awarded_unpaid' then
    return 'refund_required';
  end if;

  update public.orders set payment_status = 'paid', paid_at = now() where id = v_order.id;
  perform public.transition_request(v_order.request_id, 'paid', 'تم الدفع');
  perform public.transition_request(v_order.request_id, 'awaiting_client', 'بانتظار التفويض والمستندات');
  return 'processed';
end;
$$;

-- ============================================================
-- record_refund: تسجيل استرداد كامل ناجح من البوابة + قيد عكسي
-- p_cancel_request: إلغاء الطلب في المعاملة نفسها (الإلغاء قبل بدء التنفيذ)
-- ============================================================
create function public.record_refund(
  p_payment_id uuid,
  p_refund_ref text,
  p_amount_halalas integer,
  p_raw jsonb,
  p_cancel_request boolean,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_order public.orders;
  v_paid_journal uuid;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;
  if v_payment.status = 'refunded' then
    return 'duplicate';
  end if;
  if v_payment.status <> 'paid' then
    raise exception 'payment_not_paid' using errcode = '55000';
  end if;
  if p_amount_halalas <> v_payment.amount_halalas then
    raise exception 'partial_refund_not_supported' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = v_payment.order_id for update;

  select journal_id into v_paid_journal from public.ledger_entries
  where payment_id = v_payment.id and account = 'escrow' and debit_halalas > 0 and reverses_journal_id is null
  limit 1;

  -- قيد عكسي: الضمان → العميل
  perform public.ledger_transfer(
    v_order.id, v_payment.id, 'escrow', 'client', v_payment.amount_halalas,
    'استرداد كامل للعميل (قيد عكسي)', v_paid_journal
  );

  update public.payments
  set status = 'refunded', refunded_at = now(), refund_ref = p_refund_ref,
      raw_webhook = coalesce(p_raw, raw_webhook)
  where id = v_payment.id;

  -- الطلب يصبح مُسترداً إذا كانت هذه دفعته المعتمدة
  if v_order.payment_status = 'paid' and not exists (
    select 1 from public.payments where order_id = v_order.id and status = 'paid'
  ) then
    update public.orders set payment_status = 'refunded', refunded_at = now() where id = v_order.id;
  end if;

  if p_cancel_request then
    perform public.transition_request(v_order.request_id, 'cancelled', coalesce(p_note, 'إلغاء مع استرداد كامل'));
  end if;
  return 'processed';
end;
$$;

-- ============================================================
-- رصيد الحسابات لطلب (للعرض والاختبارات)
-- ============================================================
create function public.order_ledger_balances(p_order_id uuid)
returns table (account public.ledger_account, debit_halalas bigint, credit_halalas bigint, balance_halalas bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select account, sum(debit_halalas)::bigint, sum(credit_halalas)::bigint,
         (sum(debit_halalas) - sum(credit_halalas))::bigint
  from public.ledger_entries
  where order_id = p_order_id
    and (public.is_admin() or public.is_request_member((select request_id from public.orders where id = p_order_id)) or auth.uid() is null)
  group by account
  order by account;
$$;

-- ============================================================
-- الصلاحيات: الكتابة المالية من الخادم بمفتاح الخدمة فقط
-- ============================================================
revoke all on function public.ledger_transfer from public, anon, authenticated, service_role;
revoke all on function public.create_order_for_request from public, anon, authenticated;
revoke all on function public.on_request_awarded from public, anon, authenticated;
revoke all on function public.register_payment_attempt from public, anon, authenticated;
revoke all on function public.record_payment_result from public, anon, authenticated;
revoke all on function public.record_refund from public, anon, authenticated;
revoke all on function public.order_ledger_balances from public, anon;
grant execute on function public.order_ledger_balances to authenticated;

revoke all on public.orders from anon, authenticated;
grant select on public.orders to authenticated;

revoke all on public.payments from anon, authenticated;
-- raw_webhook لا يُكشف للواجهة
grant select (id, order_id, gateway, provider_ref, amount_halalas, currency, status, failure_reason,
              created_at, paid_at, refunded_at)
  on public.payments to authenticated;

revoke all on public.payment_webhook_events from anon, authenticated;

-- الدفتر: لا كتابة مباشرة لأي دور تطبيقي (حتى مفتاح الخدمة)؛ الإدراج عبر الدوال فقط
revoke all on public.ledger_entries from anon, authenticated, service_role;
grant select on public.ledger_entries to authenticated, service_role;

alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.ledger_entries enable row level security;

create policy "orders: request members, awarded provider, admin"
  on public.orders for select to authenticated
  using (
    (select public.is_request_member(request_id))
    or (select public.is_awarded_provider(request_id))
    or (select public.is_admin())
  );

create policy "payments: request members, admin"
  on public.payments for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and (select public.is_request_member(o.request_id))
    )
    or (select public.is_admin())
  );

create policy "ledger_entries: admin"
  on public.ledger_entries for select to authenticated
  using ((select public.is_admin()));
