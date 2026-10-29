-- المرحلة 5: دورة التنفيذ بعد الدفع حتى الإغلاق
-- التفويض، مستندات العميل، التنفيذ والتسليم، المحادثة، التأكيد/النزاع، التسويات المالية، التأخر

-- ============================================================
-- إعدادات وأنواع
-- ============================================================
insert into public.settings (key, value, description) values
  ('cancel_after_start_provider_pct', '30', 'نسبة أتعاب المزوّد المستحقة له عند الإلغاء بعد بدء التنفيذ'),
  ('chat_blocked_terms',
   '["كلمة المرور","كلمة السر","كلمه المرور","كلمه السر","الرقم السري","رمز التحقق","رمز التفعيل","كود التحقق","الكود اللي وصلك","باسورد","باسوورد","otp","password","passcode","verification code"]',
   'كلمات تُرفض بها الرسائل وتُسجّل للإدارة (طلب كلمة مرور أو رمز تحقق)');

alter type public.order_payment_status add value if not exists 'partially_refunded';
alter type public.payment_status add value if not exists 'partially_refunded';

create type public.request_document_kind as enum ('client_document', 'delivery_proof');
create type public.dispute_decision as enum ('provider', 'full_refund', 'partial_refund');

-- ============================================================
-- أعمدة التنفيذ على الطلب والتسوية على الطلب المالي
-- ============================================================
alter table public.service_requests
  add column delegation_confirmed_at timestamptz,
  add column started_at timestamptz,
  add column due_at timestamptz,
  add column delivered_at timestamptz,
  add column delivery_note text check (delivery_note is null or char_length(delivery_note) <= 2000),
  add column closed_at timestamptz,
  add column is_late boolean not null default false;

alter table public.orders
  add column refunded_halalas integer not null default 0 check (refunded_halalas >= 0),
  add column provider_payable_halalas integer check (provider_payable_halalas >= 0),
  add column platform_revenue_halalas integer check (platform_revenue_halalas >= 0),
  add column settlement text check (settlement in ('completed', 'dispute_provider', 'dispute_full_refund', 'dispute_partial_refund', 'cancelled_after_start', 'refunded_before_start')),
  add column settled_at timestamptz;

alter table public.payments
  add column refunded_halalas integer not null default 0 check (refunded_halalas >= 0);

-- ============================================================
-- إرشادات التفويض الرسمي (قابلة للتعديل من الإدارة)
-- ============================================================
create table public.delegation_guides (
  platform public.delegation_platform primary key,
  title text not null check (char_length(title) between 2 and 120),
  steps text[] not null check (cardinality(steps) between 1 and 20),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  -- الإرشادات نفسها لا تطلب كلمات مرور أو رموز تحقق
  constraint delegation_guides_no_credentials check (
    not public.mentions_credentials(array_to_string(steps, ' '))
  )
);

insert into public.delegation_guides (platform, title, steps) values
  ('qiwa', 'تفويض المكتب عبر منصة قوى', array[
    'ادخل إلى منصة قوى (qiwa.sa) بحسابك كصاحب المنشأة أو مفوّضها.',
    'اختر المنشأة المعنية ثم «إدارة المستخدمين» أو «التفويض».',
    'أضف المكتب بهويته أو رقم سجله التجاري الظاهر لك بعد الترسية، وامنحه صلاحية الخدمة المطلوبة فقط.',
    'حدّد مدة التفويض بما يكفي لإنجاز الخدمة، ثم أكّد.',
    'ارجع هنا واضغط «تم منح التفويض».'
  ]),
  ('balady', 'تفويض المكتب عبر منصة بلدي', array[
    'ادخل إلى منصة بلدي (balady.gov.sa) بحسابك.',
    'من «خدماتي» اختر «تفويض الغير» أو «المفوّضين».',
    'أضف المكتب بهوية المسؤول أو سجل المكتب، وحدد الخدمة والرخصة المعنية.',
    'أكّد التفويض ثم ارجع هنا واضغط «تم منح التفويض».'
  ]),
  ('mc', 'تفويض المكتب عبر منصة وزارة التجارة', array[
    'ادخل إلى منصة الأعمال بوزارة التجارة (business.sa) بحسابك.',
    'اختر السجل التجاري ثم «التفويض» أو «إضافة مفوّض».',
    'أضف المكتب وحدد الصلاحية المطلوبة للخدمة فقط ومدتها.',
    'أكّد التفويض ثم ارجع هنا واضغط «تم منح التفويض».'
  ]),
  ('none', 'لا يتطلب تفويضاً عبر منصة', array[
    'هذه الخدمة لا تتطلب تفويضاً عبر منصة حكومية.',
    'جهّز المستندات المطلوبة وارفعها في الأسفل، ثم اضغط «تم» ليبدأ المكتب.'
  ]);

-- ============================================================
-- مستندات الطلب (العميل) وإثباتات الإنجاز (المزوّد) — bucket خاص
-- المسار: {request_id}/{kind}/{uuid}.{ext}
-- ============================================================
create table public.request_documents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  kind public.request_document_kind not null,
  label text not null check (char_length(label) between 1 and 120),
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) <= 200),
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index request_documents_request_idx on public.request_documents (request_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('request-documents', 'request-documents', false, 5242880,
        array['application/pdf', 'image/jpeg', 'image/png']);

-- ============================================================
-- المحادثة: خيط لكل (طلب، مزوّد) — العميل يرى كل خيوط طلبه، والمزوّد خيطه فقط
-- ============================================================
create table public.messages (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.service_requests (id) on delete cascade,
  provider_id uuid not null references public.providers (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete restrict,
  sender_role text not null check (sender_role in ('requester', 'provider', 'admin')),
  body text not null check (char_length(body) between 1 and 2000),
  was_masked boolean not null default false,
  created_at timestamptz not null default now()
);

create index messages_thread_idx on public.messages (request_id, provider_id, id);

-- رسائل مرفوضة (طلب كلمة مرور/رمز تحقق) لمراجعة الإدارة
create table public.blocked_messages (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.service_requests (id) on delete cascade,
  provider_id uuid references public.providers (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete restrict,
  body text not null,
  matched_term text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- النزاعات
-- ============================================================
create table public.disputes (
  request_id uuid primary key references public.service_requests (id) on delete cascade,
  opened_by uuid not null references public.profiles (id) on delete restrict,
  reason text not null check (char_length(reason) between 5 and 2000),
  opened_at timestamptz not null default now(),
  decision public.dispute_decision,
  refund_halalas integer check (refund_halalas >= 0),
  decision_note text check (decision_note is null or char_length(decision_note) <= 2000),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz
);

-- ============================================================
-- آلة الحالات: دالة داخلية بمنفّذ صريح + الواجهة العامة تحدد المنفّذ
-- ============================================================
create function public.transition_request_as(
  p_request_id uuid,
  p_to public.request_status,
  p_actor text,
  p_actor_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.service_requests;
  v_allowed text[];
begin
  select * into v_request from public.service_requests where id = p_request_id for update;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
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
    -- الإلغاء بعد الدفع يتم عبر دوال التسوية فقط (بعد الاسترداد من البوابة)
    when 'paid>cancelled'                then array['system']
    when 'awaiting_client>in_progress'   then array['provider']
    when 'awaiting_client>cancelled'     then array['system']
    when 'in_progress>delivered'         then array['provider']
    when 'in_progress>disputed'          then array['requester']
    when 'in_progress>cancelled'         then array['system']
    when 'delivered>completed'           then array['requester', 'system', 'admin']
    when 'delivered>disputed'            then array['requester']
    when 'disputed>resolved'             then array['admin']
    else null
  end;

  if v_allowed is null then
    raise exception 'invalid_transition' using errcode = '55000',
      detail = format('%s -> %s', v_request.status, p_to);
  end if;
  if not (p_actor = any (v_allowed)) then
    raise exception 'forbidden_transition' using errcode = '42501',
      detail = format('%s -> %s by %s', v_request.status, p_to, p_actor);
  end if;

  if p_to = 'awarded_unpaid' and v_request.awarded_bid_id is null then
    raise exception 'no_awarded_bid' using errcode = '55000';
  end if;
  -- لا يُغلق طلب ما زالت أمواله في الضمان دون تسوية
  if p_to in ('cancelled', 'completed', 'resolved') and exists (
    select 1 from public.orders
    where request_id = p_request_id and payment_status = 'paid' and settled_at is null
  ) then
    raise exception 'settlement_required' using errcode = '55000';
  end if;

  update public.service_requests
  set status = p_to,
      published_at = case when p_to = 'open' then now() else published_at end,
      closed_at = case when p_to in ('completed', 'resolved', 'cancelled', 'expired') then now() else closed_at end
  where id = p_request_id;

  insert into public.order_events (request_id, from_status, to_status, actor_id, actor_role, note)
  values (p_request_id, v_request.status, p_to, p_actor_id, p_actor, left(nullif(trim(p_note), ''), 500));
end;
$$;

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
  v_actor text;
begin
  if not exists (select 1 from public.service_requests where id = p_request_id) then
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

  perform public.transition_request_as(p_request_id, p_to, v_actor, v_uid, p_note);
end;
$$;

-- الاسترداد الكامل قبل البدء (المرحلة 4) يُعلَّم كتسوية
create or replace function public.record_refund(
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

  perform public.ledger_transfer(
    v_order.id, v_payment.id, 'escrow', 'client', v_payment.amount_halalas,
    'استرداد كامل للعميل (قيد عكسي)', v_paid_journal
  );

  update public.payments
  set status = 'refunded', refunded_at = now(), refund_ref = p_refund_ref,
      refunded_halalas = v_payment.amount_halalas, raw_webhook = coalesce(p_raw, raw_webhook)
  where id = v_payment.id;

  if v_order.payment_status = 'paid' and not exists (
    select 1 from public.payments where order_id = v_order.id and status = 'paid'
  ) then
    update public.orders
    set payment_status = 'refunded', refunded_at = now(), refunded_halalas = v_order.total_paid_halalas,
        provider_payable_halalas = 0, platform_revenue_halalas = 0,
        settlement = 'refunded_before_start', settled_at = now()
    where id = v_order.id;
  end if;

  if p_cancel_request then
    perform public.transition_request_as(
      v_order.request_id, 'cancelled', 'system', null, coalesce(p_note, 'إلغاء مع استرداد كامل')
    );
  end if;
  return 'processed';
end;
$$;

-- عرض المبلغ بالريال في الملاحظات: 6000 → "60.00 ر.س"
create function public.format_sar(p_halalas bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_halalas / 100.0, 'FM999999990.00') || ' ر.س';
$$;

-- ============================================================
-- التسوية المالية: توزيع الضمان عند الإغلاق
--   R = 0          : إكمال — الضمان → إيراد المنصة (رسم الخدمة + العمولة) والضمان → مستحق المزوّد (الصافي)
--   0 < R ≤ الأتعاب : استرداد جزئي — يُخصم من أتعاب المزوّد؛ العمولة تُحسب على الأتعاب المتبقية؛
--                    رسم الخدمة لا يُسترد
--   R = الإجمالي    : استرداد كامل — الضمان → العميل
-- المجموع دائماً = ما في الضمان، فيصبح رصيد الضمان صفراً
-- ============================================================
create function public.settle_order_ledger(
  p_order_id uuid,
  p_refund_halalas integer,
  p_refund_ref text,
  p_settlement text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_payment public.payments;
  v_kept_fee bigint;
  v_commission bigint;
  v_net bigint;
  v_revenue bigint;
  v_full boolean;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.payment_status <> 'paid' then
    raise exception 'order_not_paid' using errcode = '55000';
  end if;
  if v_order.settled_at is not null then
    raise exception 'order_already_settled' using errcode = '55000';
  end if;

  select * into v_payment from public.payments
  where order_id = p_order_id and status = 'paid'
  order by paid_at limit 1
  for update;

  v_full := p_refund_halalas = v_order.total_paid_halalas;
  if p_refund_halalas < 0 or (not v_full and p_refund_halalas > v_order.fee_halalas) then
    raise exception 'invalid_refund_amount' using errcode = '22023',
      detail = format('0..%s or %s', v_order.fee_halalas, v_order.total_paid_halalas);
  end if;

  if v_full then
    perform public.ledger_transfer(v_order.id, v_payment.id, 'escrow', 'client', v_order.total_paid_halalas,
      'استرداد كامل للعميل');
    v_revenue := 0;
    v_net := 0;
  else
    v_kept_fee := v_order.fee_halalas - p_refund_halalas;
    v_commission := public.round_bps(v_kept_fee, v_order.provider_commission_bps);
    v_net := v_kept_fee - v_commission;
    v_revenue := v_order.client_fee_halalas + v_commission;

    if p_refund_halalas > 0 then
      perform public.ledger_transfer(v_order.id, v_payment.id, 'escrow', 'client', p_refund_halalas,
        'استرداد جزئي للعميل');
    end if;
    if v_revenue > 0 then
      perform public.ledger_transfer(v_order.id, v_payment.id, 'escrow', 'platform_revenue', v_revenue,
        'إيراد المنصة: رسم الخدمة + العمولة');
    end if;
    if v_net > 0 then
      perform public.ledger_transfer(v_order.id, v_payment.id, 'escrow', 'provider_payable', v_net,
        'مستحق للمزوّد: صافي الأتعاب بعد العمولة');
    end if;
  end if;

  if p_refund_halalas > 0 then
    update public.payments
    set status = case when v_full then 'refunded' else 'partially_refunded' end::public.payment_status,
        refunded_halalas = p_refund_halalas, refund_ref = p_refund_ref, refunded_at = now()
    where id = v_payment.id;
  end if;

  update public.orders
  set payment_status = case
        when v_full then 'refunded'
        when p_refund_halalas > 0 then 'partially_refunded'
        else 'paid' end::public.order_payment_status,
      refunded_halalas = p_refund_halalas,
      refunded_at = case when p_refund_halalas > 0 then now() else refunded_at end,
      provider_payable_halalas = v_net,
      platform_revenue_halalas = v_revenue,
      settlement = p_settlement,
      settled_at = now()
  where id = v_order.id;
end;
$$;

-- ============================================================
-- خطوات العميل: تأكيد التفويض، التأكيد/الاعتراض
-- ============================================================
create function public.confirm_delegation(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_request_member(p_request_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.service_requests
  set delegation_confirmed_at = coalesce(delegation_confirmed_at, now())
  where id = p_request_id and status = 'awaiting_client';
  if not found then
    raise exception 'invalid_status' using errcode = '55000';
  end if;
  insert into public.order_events (request_id, from_status, to_status, actor_id, actor_role, note)
  values (p_request_id, 'awaiting_client', 'awaiting_client', auth.uid(), 'requester', 'أكّد العميل منح التفويض');
end;
$$;

create function public.confirm_completion(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
begin
  if not public.is_request_member(p_request_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if (select status from public.service_requests where id = p_request_id) <> 'delivered' then
    raise exception 'invalid_status' using errcode = '55000';
  end if;
  select id into v_order_id from public.orders where request_id = p_request_id;
  perform public.settle_order_ledger(v_order_id, 0, null, 'completed');
  perform public.transition_request_as(p_request_id, 'completed', 'requester', auth.uid(), 'أكّد العميل الإنجاز');
end;
$$;

create function public.open_dispute(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_request_member(p_request_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  insert into public.disputes (request_id, opened_by, reason)
  values (p_request_id, auth.uid(), trim(p_reason));
  perform public.transition_request_as(p_request_id, 'disputed', 'requester', auth.uid(), 'اعتراض: ' || left(trim(p_reason), 400));
end;
$$;

-- ============================================================
-- خطوات المزوّد: بدء التنفيذ، التسليم
-- ============================================================
create function public.start_execution(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.service_requests;
  v_platform public.delegation_platform;
  v_duration integer;
begin
  if not public.is_awarded_provider(p_request_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_request from public.service_requests where id = p_request_id for update;
  select st.delegation_platform into v_platform from public.service_types st where st.id = v_request.service_type_id;
  if v_request.status <> 'awaiting_client' then
    raise exception 'invalid_status' using errcode = '55000';
  end if;
  if v_platform <> 'none' and v_request.delegation_confirmed_at is null then
    raise exception 'delegation_not_confirmed' using errcode = '55000';
  end if;

  select duration_days into v_duration from public.bids where id = v_request.awarded_bid_id;
  update public.service_requests
  set started_at = now(), due_at = now() + make_interval(days => v_duration)
  where id = p_request_id;
  perform public.transition_request_as(p_request_id, 'in_progress', 'provider', auth.uid(), 'بدأ المكتب التنفيذ');
end;
$$;

create function public.submit_delivery(p_request_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.service_requests;
begin
  if not public.is_awarded_provider(p_request_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_request from public.service_requests where id = p_request_id for update;
  if v_request.status <> 'in_progress' then
    raise exception 'invalid_status' using errcode = '55000';
  end if;
  if char_length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'delivery_note_required' using errcode = '22023';
  end if;
  if public.mentions_credentials(p_note) then
    raise exception 'credentials_not_allowed' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.request_documents where request_id = p_request_id and kind = 'delivery_proof'
  ) then
    raise exception 'delivery_proof_required' using errcode = '55000';
  end if;

  update public.service_requests
  set delivered_at = now(), delivery_note = trim(p_note),
      is_late = is_late or (due_at is not null and now() > due_at)
  where id = p_request_id;
  perform public.transition_request_as(p_request_id, 'delivered', 'provider', auth.uid(), 'سلّم المكتب الخدمة');
end;
$$;

-- ============================================================
-- تسويات تتطلب البوابة (تُستدعى من الخادم بمفتاح الخدمة بعد نجاح الاسترداد)
-- ============================================================
-- نسبة الإلغاء بعد البدء ومبلغ الاسترداد الناتج (للعرض والتنفيذ)
create function public.cancellation_after_start_refund(p_request_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (o.fee_halalas - public.round_bps(o.fee_halalas,
            public.pct_to_bps((select value from public.settings where key = 'cancel_after_start_provider_pct'))))::integer
  from public.orders o
  where o.request_id = p_request_id
    and (public.is_request_member(p_request_id) or public.is_admin() or auth.uid() is null);
$$;

create function public.cancel_after_start(
  p_request_id uuid,
  p_refund_ref text,
  p_actor_id uuid,
  p_actor text default 'requester'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_refund integer;
begin
  if (select status from public.service_requests where id = p_request_id for update) <> 'in_progress' then
    raise exception 'invalid_status' using errcode = '55000';
  end if;
  select id into v_order_id from public.orders where request_id = p_request_id;
  v_refund := public.cancellation_after_start_refund(p_request_id);
  perform public.settle_order_ledger(v_order_id, v_refund, p_refund_ref, 'cancelled_after_start');
  perform public.transition_request_as(p_request_id, 'cancelled', 'system', p_actor_id,
    format('إلغاء بعد بدء التنفيذ بطلب %s — استرداد %s',
      case p_actor when 'admin' then 'الإدارة' else 'العميل' end, public.format_sar(v_refund)));
  return v_refund;
end;
$$;

create function public.resolve_dispute(
  p_request_id uuid,
  p_decision public.dispute_decision,
  p_refund_halalas integer,
  p_refund_ref text,
  p_admin_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_refund integer;
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and role = 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if (select status from public.service_requests where id = p_request_id) <> 'disputed' then
    raise exception 'invalid_status' using errcode = '55000';
  end if;
  select * into v_order from public.orders where request_id = p_request_id;

  v_refund := case p_decision
    when 'provider' then 0
    when 'full_refund' then v_order.total_paid_halalas
    else p_refund_halalas
  end;
  if p_decision = 'partial_refund' and (v_refund is null or v_refund <= 0 or v_refund > v_order.fee_halalas) then
    raise exception 'invalid_refund_amount' using errcode = '22023';
  end if;

  perform public.settle_order_ledger(
    v_order.id, v_refund, p_refund_ref,
    case p_decision when 'provider' then 'dispute_provider'
                    when 'full_refund' then 'dispute_full_refund'
                    else 'dispute_partial_refund' end
  );

  update public.disputes
  set decision = p_decision, refund_halalas = v_refund, decision_note = nullif(trim(p_note), ''),
      resolved_by = p_admin_id, resolved_at = now()
  where request_id = p_request_id;

  perform public.transition_request_as(p_request_id, 'resolved', 'admin', p_admin_id,
    case p_decision when 'provider' then 'قرار النزاع: لصالح المزوّد'
                    when 'full_refund' then 'قرار النزاع: استرداد كامل'
                    else format('قرار النزاع: استرداد جزئي %s', public.format_sar(v_refund)) end);
end;
$$;

-- ============================================================
-- المهام المجدولة: الإكمال التلقائي بعد 3 أيام، وتعليم التأخر
-- ============================================================
create function public.run_order_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer := coalesce(public.int_setting('delivery_confirmation_days'), 3);
  v_request record;
  v_completed integer := 0;
  v_late integer;
begin
  for v_request in
    select r.id, o.id as order_id from public.service_requests r
    join public.orders o on o.request_id = r.id
    where r.status = 'delivered' and r.delivered_at <= now() - make_interval(days => v_days)
    for update of r skip locked
  loop
    perform public.settle_order_ledger(v_request.order_id, 0, null, 'completed');
    perform public.transition_request_as(v_request.id, 'completed', 'system', null,
      format('إكمال تلقائي: لا رد من العميل خلال %s أيام من التسليم', v_days));
    v_completed := v_completed + 1;
  end loop;

  update public.service_requests
  set is_late = true
  where status = 'in_progress' and not is_late and due_at < now();
  get diagnostics v_late = row_count;

  return jsonb_build_object('auto_completed', v_completed, 'flagged_late', v_late);
end;
$$;

select cron.schedule('order-maintenance', '*/10 * * * *', $$select public.run_order_maintenance()$$);

-- ============================================================
-- إحصاءات المزوّد (الإنجاز والتأخر)
-- ============================================================
create function public.provider_performance(p_provider_id uuid)
returns table (completed_orders integer, late_orders integer, on_time_pct integer)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select r.status, r.is_late
    from public.service_requests r
    join public.bids b on b.id = r.awarded_bid_id
    where b.provider_id = p_provider_id and r.started_at is not null
  )
  select
    count(*) filter (where status in ('completed', 'resolved'))::integer,
    count(*) filter (where is_late)::integer,
    case when count(*) filter (where status in ('completed', 'resolved', 'delivered')) = 0 then null
         else round(100.0 * count(*) filter (where status in ('completed', 'resolved', 'delivered') and not is_late)
                    / count(*) filter (where status in ('completed', 'resolved', 'delivered')))::integer
    end
  from mine;
$$;

-- ============================================================
-- المحادثة: الإرسال عبر دالة تفلتر النص
-- ============================================================
create function public.mask_contact_info(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(p_text, '[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}', '[محجوب]', 'gi'),
        '(https?://|www\.)\S+', '[محجوب]', 'gi'),
      '\m[a-z0-9\-]+\.(com|net|org|sa|io|me|info)\M\S*', '[محجوب]', 'gi'),
    -- أرقام هاتف: 9 أرقام فأكثر (عربية أو لاتينية) مع مسافة أو شرطة اختيارية بينها
    '\+?[0-9٠-٩](?:[\s\-]?[0-9٠-٩]){8,}', '[محجوب]', 'g');
$$;

create function public.blocked_term_in(p_text text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select t from jsonb_array_elements_text(
    coalesce((select value from public.settings where key = 'chat_blocked_terms'), '[]'::jsonb)
  ) t
  where position(lower(t) in lower(regexp_replace(p_text, '\s+', ' ', 'g'))) > 0
  limit 1;
$$;

create function public.can_access_thread(p_request_id uuid, p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_admin()
    or (
      public.is_request_member(p_request_id)
      and exists (
        select 1 from public.service_requests r
        where r.id = p_request_id
          and (r.target_provider_id = p_provider_id
               or exists (select 1 from public.bids b where b.request_id = r.id and b.provider_id = p_provider_id))
      )
    )
    or (
      p_provider_id = public.current_provider_id()
      and public.provider_can_view_request(p_request_id)
    );
$$;

create function public.send_message(p_request_id uuid, p_provider_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_status public.request_status;
  v_term text;
  v_body text := trim(coalesce(p_body, ''));
  v_masked text;
  v_awarded_thread boolean;
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.can_access_thread(p_request_id, p_provider_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(v_body) = 0 or char_length(v_body) > 2000 then
    raise exception 'invalid_message' using errcode = '22023';
  end if;

  v_role := case
    when public.is_admin() then 'admin'
    when public.is_request_member(p_request_id) then 'requester'
    else 'provider' end;

  select status into v_status from public.service_requests where id = p_request_id;
  if v_status in ('completed', 'resolved', 'cancelled', 'expired') then
    raise exception 'thread_closed' using errcode = '55000';
  end if;

  -- طلب كلمة مرور أو رمز تحقق: يُرفض ويُسجّل للإدارة
  v_term := public.blocked_term_in(v_body);
  if v_term is null and public.mentions_credentials(v_body) then
    v_term := 'credentials_pattern';
  end if;
  if v_term is not null then
    insert into public.blocked_messages (request_id, provider_id, sender_id, body, matched_term)
    values (p_request_id, p_provider_id, v_uid, v_body, v_term);
    return jsonb_build_object('status', 'blocked', 'term', v_term);
  end if;

  -- قبل الترسية على هذا المزوّد: حجب الجوال والبريد والروابط
  v_awarded_thread := exists (
    select 1 from public.service_requests r join public.bids b on b.id = r.awarded_bid_id
    where r.id = p_request_id and b.provider_id = p_provider_id
      and r.status not in ('open', 'draft', 'awarded_unpaid')
  );
  v_masked := case when v_awarded_thread then v_body else public.mask_contact_info(v_body) end;

  insert into public.messages (request_id, provider_id, sender_id, sender_role, body, was_masked)
  values (p_request_id, p_provider_id, v_uid, v_role, v_masked, v_masked <> v_body)
  returning id into v_id;
  return jsonb_build_object('status', case when v_masked <> v_body then 'masked' else 'sent' end, 'id', v_id);
end;
$$;

-- ============================================================
-- صلاحيات الدوال
-- ============================================================
revoke all on function public.transition_request_as from public, anon, authenticated, service_role;
revoke all on function public.settle_order_ledger from public, anon, authenticated, service_role;
revoke all on function public.run_order_maintenance from public, anon, authenticated;
revoke all on function public.cancel_after_start from public, anon, authenticated;
revoke all on function public.resolve_dispute from public, anon, authenticated;
revoke all on function public.confirm_delegation from public, anon;
grant execute on function public.confirm_delegation to authenticated;
revoke all on function public.confirm_completion from public, anon;
grant execute on function public.confirm_completion to authenticated;
revoke all on function public.open_dispute from public, anon;
grant execute on function public.open_dispute to authenticated;
revoke all on function public.start_execution from public, anon;
grant execute on function public.start_execution to authenticated;
revoke all on function public.submit_delivery from public, anon;
grant execute on function public.submit_delivery to authenticated;
revoke all on function public.send_message from public, anon;
grant execute on function public.send_message to authenticated;
revoke all on function public.cancellation_after_start_refund from public, anon;
grant execute on function public.cancellation_after_start_refund to authenticated;
grant execute on function public.provider_performance to anon, authenticated;

-- ============================================================
-- الجداول و RLS
-- ============================================================
revoke all on public.delegation_guides from anon, authenticated;
grant select on public.delegation_guides to authenticated;
grant update (title, steps, updated_at, updated_by) on public.delegation_guides to authenticated;

revoke all on public.request_documents from anon, authenticated;
grant select on public.request_documents to authenticated;
grant insert (request_id, kind, label, storage_path, file_name, mime_type, size_bytes, uploaded_by)
  on public.request_documents to authenticated;

revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
revoke all on public.blocked_messages from anon, authenticated;
grant select on public.blocked_messages to authenticated;
revoke all on public.disputes from anon, authenticated;
grant select on public.disputes to authenticated;

alter table public.delegation_guides enable row level security;
alter table public.request_documents enable row level security;
alter table public.messages enable row level security;
alter table public.blocked_messages enable row level security;
alter table public.disputes enable row level security;

create policy "delegation_guides: read authenticated"
  on public.delegation_guides for select to authenticated using (true);
create policy "delegation_guides: admin updates"
  on public.delegation_guides for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- المستندات: العميل والمزوّد المُرسى عليه والإدارة
create policy "request_documents: members, awarded provider, admin"
  on public.request_documents for select to authenticated
  using (
    (select public.is_request_member(request_id))
    or (select public.is_awarded_provider(request_id))
    or (select public.is_admin())
  );
-- العميل يرفع مستنداته بعد الدفع وحتى التسليم؛ المزوّد يرفع إثبات الإنجاز أثناء التنفيذ
create policy "request_documents: client uploads"
  on public.request_documents for insert to authenticated
  with check (
    kind = 'client_document'
    and uploaded_by = (select auth.uid())
    and (select public.is_request_member(request_id))
    and exists (select 1 from public.service_requests r
                where r.id = request_id and r.status in ('awaiting_client', 'in_progress'))
  );
create policy "request_documents: provider uploads proof"
  on public.request_documents for insert to authenticated
  with check (
    kind = 'delivery_proof'
    and uploaded_by = (select auth.uid())
    and (select public.is_awarded_provider(request_id))
    and exists (select 1 from public.service_requests r
                where r.id = request_id and r.status = 'in_progress')
  );

create policy "messages: thread participants"
  on public.messages for select to authenticated
  using ((select public.can_access_thread(request_id, provider_id)));

create policy "blocked_messages: admin"
  on public.blocked_messages for select to authenticated
  using ((select public.is_admin()));

create policy "disputes: members, awarded provider, admin"
  on public.disputes for select to authenticated
  using (
    (select public.is_request_member(request_id))
    or (select public.is_awarded_provider(request_id))
    or (select public.is_admin())
  );

-- Storage: request-documents — المسار يبدأ بمعرّف الطلب
create policy "request-documents: read members, awarded provider, admin"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'request-documents'
    and (
      (select public.is_admin())
      or public.is_request_member(((storage.foldername(name))[1])::uuid)
      or public.is_awarded_provider(((storage.foldername(name))[1])::uuid)
    )
  );

create policy "request-documents: client uploads"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'request-documents'
    and (storage.foldername(name))[2] = 'client_document'
    and public.is_request_member(((storage.foldername(name))[1])::uuid)
    and exists (select 1 from public.service_requests r
                where r.id = ((storage.foldername(name))[1])::uuid
                  and r.status in ('awaiting_client', 'in_progress'))
  );

create policy "request-documents: provider uploads proof"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'request-documents'
    and (storage.foldername(name))[2] = 'delivery_proof'
    and public.is_awarded_provider(((storage.foldername(name))[1])::uuid)
    and exists (select 1 from public.service_requests r
                where r.id = ((storage.foldername(name))[1])::uuid and r.status = 'in_progress')
  );
