-- المرحلة 8: الإشعارات
-- إشعار داخل المنصة لكل حدث مهم + صف في صندوق الإرسال (outbox) لكل قناة خارجية.
-- الأحداث تُولَّد في قاعدة البيانات (triggers على order_events والعروض والرسائل والصرف)
-- فلا يفوت حدث مهما كان مساره؛ وخادم التطبيق يرسل البريد من الـ outbox عبر NotificationProvider.

-- ============================================================
-- الجداول
-- ============================================================
create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]+$'),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 1000),
  link text check (link is null or link ~ '^/[A-Za-z0-9/_?=&-]*$'),
  -- يمنع تكرار الإشعار نفسه (مثل تذكير المهلة أو رسائل متتالية في الخيط)
  dedupe_key text unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- قنوات خارجية: email الآن، whatsapp محجوز لاحقاً
create table public.notification_outbox (
  id bigint generated always as identity primary key,
  notification_id bigint not null references public.notifications (id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (notification_id, channel)
);

create index notification_outbox_pending_idx on public.notification_outbox (created_at)
  where status = 'pending';

alter table public.notifications enable row level security;
alter table public.notification_outbox enable row level security;

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy "notifications: read own"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create policy "notifications: mark own read"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- صندوق الإرسال للخادم فقط (service_role يتجاوز RLS؛ لا سياسات للمستخدمين)
revoke all on public.notification_outbox from anon, authenticated;

-- ============================================================
-- الإنشاء
-- ============================================================
create function public.notify(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_link text,
  p_dedupe_key text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if p_user_id is null then
    return;
  end if;
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  values (p_user_id, p_kind, left(p_title, 200), left(coalesce(p_body, ''), 1000), p_link, p_dedupe_key)
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  if v_id is not null then
    insert into public.notification_outbox (notification_id, channel) values (v_id, 'email');
  end if;
end;
$$;

revoke all on function public.notify from public, anon, authenticated;

-- أعضاء حساب طالب الخدمة للطلب
create function public.notify_request_members(
  p_request_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_dedupe_key text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in
    select m.user_id
    from public.service_requests r
    join public.establishment_members m on m.account_id = r.requester_account_id
    where r.id = p_request_id
  loop
    perform public.notify(v_user, p_kind, p_title, p_body,
      '/dashboard/requester/requests/' || p_request_id,
      case when p_dedupe_key is null then null else p_dedupe_key || ':' || v_user end);
  end loop;
end;
$$;

create function public.notify_provider(
  p_provider_id uuid,
  p_request_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_dedupe_key text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.notify(
    p.profile_id, p_kind, p_title, p_body,
    case when p_request_id is null then '/dashboard/provider'
         else '/dashboard/provider/requests/' || p_request_id end,
    p_dedupe_key)
  from public.providers p where p.id = p_provider_id;
$$;

create function public.notify_admins(p_kind text, p_title text, p_body text, p_link text)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.notify(p.id, p_kind, p_title, p_body, p_link)
  from public.profiles p where p.role = 'admin' and p.suspended_at is null;
$$;

revoke all on function public.notify_request_members from public, anon, authenticated;
revoke all on function public.notify_provider from public, anon, authenticated;
revoke all on function public.notify_admins from public, anon, authenticated;

-- المزوّد المُرسى عليه الطلب (أو null)
create function public.awarded_provider_id(p_request_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.provider_id
  from public.service_requests r join public.bids b on b.id = r.awarded_bid_id
  where r.id = p_request_id;
$$;

revoke all on function public.awarded_provider_id from public, anon, authenticated;

-- ============================================================
-- الأحداث
-- ============================================================

-- انتقالات حالة الطلب
create function public.notify_on_order_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.service_requests;
  v_service text;
  v_provider uuid;
begin
  select * into v_request from public.service_requests where id = new.request_id;
  select name_ar into v_service from public.service_types where id = v_request.service_type_id;
  v_provider := public.awarded_provider_id(new.request_id);

  case new.to_status
    when 'open' then
      -- طلب عرض خاص موجّه لمكتب محدد
      if v_request.mode = 'direct_quote' then
        perform public.notify_provider(v_request.target_provider_id, new.request_id, 'quote_requested',
          'طلب عرض خاص جديد', 'طلب عميل عرضاً منك لخدمة: ' || v_service || ' (' || v_request.city || ').');
      end if;
    when 'awarded_unpaid' then
      perform public.notify_provider(v_provider, new.request_id, 'awarded',
        'تمت ترسية طلب عليك', 'اختار العميل عرضك لخدمة: ' || v_service || '. بانتظار الدفع.');
    when 'paid' then
      perform public.notify_request_members(new.request_id, 'payment_received',
        'تم استلام دفعتك', 'المبلغ محفوظ في الضمان حتى تأكيدك للإنجاز. الخطوة التالية: التفويض والمستندات.');
      perform public.notify_provider(v_provider, new.request_id, 'payment_received',
        'دفع العميل', 'دفع العميل طلب ' || v_service || '. ابدأ بعد منح التفويض ورفع المستندات.');
    when 'in_progress' then
      perform public.notify_request_members(new.request_id, 'execution_started',
        'بدأ المكتب التنفيذ', 'بدأ تنفيذ طلب ' || v_service || '.');
    when 'delivered' then
      perform public.notify_request_members(new.request_id, 'delivered',
        'سلّم المكتب طلبك',
        'راجع الإنجاز وأكّده أو اعترض خلال ' || public.int_setting('delivery_confirmation_days')
          || ' أيام، وإلا يكتمل الطلب تلقائياً.');
    when 'completed' then
      perform public.notify_provider(v_provider, new.request_id, 'completed',
        'اكتمل الطلب', 'أُضيف صافي أتعاب طلب ' || v_service || ' إلى مستحقاتك.');
      perform public.notify_request_members(new.request_id, 'completed',
        'اكتمل طلبك', 'شاركنا تقييمك للمكتب.');
    when 'disputed' then
      perform public.notify_provider(v_provider, new.request_id, 'dispute_opened',
        'اعترض العميل على التسليم', 'تراجع الإدارة النزاع وتتواصل معك عبر المنصة.');
      perform public.notify_admins('dispute_opened', 'نزاع جديد',
        'نزاع على طلب ' || v_service || '.', '/admin/disputes/' || new.request_id);
    when 'resolved' then
      perform public.notify_request_members(new.request_id, 'dispute_resolved',
        'صدر قرار النزاع', 'راجع القرار والمبالغ في صفحة الطلب.');
      perform public.notify_provider(v_provider, new.request_id, 'dispute_resolved',
        'صدر قرار النزاع', 'راجع القرار في صفحة الطلب.');
    when 'cancelled' then
      perform public.notify_provider(v_provider, new.request_id, 'cancelled',
        'أُلغي طلب', 'أُلغي طلب ' || v_service || '.');
    when 'expired' then
      perform public.notify_request_members(new.request_id, 'expired',
        'انتهت مهلة طلبك', 'انتهت مهلة العروض على طلب ' || v_service || ' دون اختيار عرض.');
    else
      null;
  end case;
  return new;
end;
$$;

create trigger order_events_notify
  after insert on public.order_events
  for each row execute function public.notify_on_order_event();

-- عرض جديد على طلب
create function public.notify_on_bid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service text;
begin
  if new.status <> 'submitted' then
    return new;
  end if;
  select t.name_ar into v_service
  from public.service_requests r join public.service_types t on t.id = r.service_type_id
  where r.id = new.request_id;
  perform public.notify_request_members(new.request_id, 'new_bid',
    'عرض جديد على طلبك', 'وصل عرض جديد على طلب ' || v_service || '. قارن العروض واختر.');
  return new;
end;
$$;

create trigger bids_notify
  after insert on public.bids
  for each row execute function public.notify_on_bid();

-- رسالة جديدة: للطرف الآخر، بلا نص الرسالة (قد يحوي بيانات قبل الترسية)،
-- وإشعار واحد لكل خيط كل 10 دقائق لتجنب الإغراق
create function public.notify_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket text := to_char(date_trunc('hour', new.created_at)
    + floor(extract(minute from new.created_at) / 10) * interval '10 minutes', 'YYYYMMDDHH24MI');
  v_key text := 'msg:' || new.request_id || ':' || new.provider_id || ':' || v_bucket;
begin
  if new.sender_role in ('provider', 'admin') then
    perform public.notify_request_members(new.request_id, 'new_message',
      'رسالة جديدة', 'لديك رسالة جديدة في محادثة الطلب.', v_key);
  end if;
  if new.sender_role in ('requester', 'admin') then
    perform public.notify_provider(new.provider_id, new.request_id, 'new_message',
      'رسالة جديدة', 'لديك رسالة جديدة من العميل.', v_key || ':p');
  end if;
  return new;
end;
$$;

create trigger messages_notify
  after insert on public.messages
  for each row execute function public.notify_on_message();

-- صرف المستحقات
create function public.notify_on_payout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notify_provider(new.provider_id, null, 'payout',
    'تم صرف مستحقاتك',
    'حُوّل لك ' || public.format_sar(new.amount_halalas::integer) || ' — مرجع التحويل ' || new.bank_reference || '.');
  return new;
end;
$$;

create trigger provider_payouts_notify
  after insert on public.provider_payouts
  for each row execute function public.notify_on_payout();

revoke all on function public.notify_on_order_event from public, anon, authenticated;
revoke all on function public.notify_on_bid from public, anon, authenticated;
revoke all on function public.notify_on_message from public, anon, authenticated;
revoke all on function public.notify_on_payout from public, anon, authenticated;

-- ============================================================
-- تذكير قبل انتهاء مهلة تأكيد التسليم بيوم (مرة واحدة لكل طلب)
-- ============================================================
create function public.remind_confirmation_deadlines()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer := public.int_setting('delivery_confirmation_days');
  v_request record;
  v_count integer := 0;
begin
  for v_request in
    select r.id, t.name_ar
    from public.service_requests r join public.service_types t on t.id = r.service_type_id
    where r.status = 'delivered'
      and r.delivered_at + make_interval(days => v_days) - interval '1 day' <= now()
  loop
    perform public.notify_request_members(v_request.id, 'confirmation_deadline',
      'تبقّى يوم لتأكيد الإنجاز',
      'إن لم تؤكد أو تعترض على طلب ' || v_request.name_ar || ' خلال يوم، يكتمل تلقائياً.',
      'confirm-reminder:' || v_request.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.remind_confirmation_deadlines from public, anon, authenticated;

select cron.schedule('confirmation-reminders', '*/30 * * * *', $$select public.remind_confirmation_deadlines()$$);
