-- ============================================================
-- الجاهزية للإطلاق: التحقق من البريد، استعادة كلمة المرور، انتهاء مهلة الدفع
-- ============================================================

-- التحقق من وسيلة التواصل: البريد برابط، والجوال (لاحقاً برسالة SMS؛ الآن عبر seed فقط)
alter table auth.users
  add column email_verified_at timestamptz,
  add column phone_verified_at timestamptz;

comment on column auth.users.email_verified_at is
  'وقت تأكيد البريد برابط التحقق؛ يُصفَّر عند تغيير البريد';

-- رموز الاستخدام الواحد (استعادة كلمة المرور، تأكيد البريد): تُخزَّن مجزّأة (sha256) فقط
create table auth.one_time_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null check (purpose in ('password_reset', 'email_verify')),
  token_hash text not null unique,
  -- البريد الذي أُرسل إليه الرابط: إن تغيّر بريد الحساب بعدها يبطل الرمز
  email text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index one_time_tokens_user_idx on auth.one_time_tokens (user_id, purpose);

alter table auth.one_time_tokens enable row level security;
revoke all on auth.one_time_tokens from public, anon, authenticated;
grant select, insert, update, delete on auth.one_time_tokens to service_role;

comment on table auth.one_time_tokens is
  'رموز روابط البريد (مجزّأة). للخادم فقط؛ لا سياسات لغيره.';

-- ============================================================
-- انتهاء مهلة الدفع: طلب اختير عرضه ولم يُدفع خلال المهلة → expired
-- ============================================================
insert into public.settings (key, value, description) values
  ('payment_window_hours', '48', 'مهلة الدفع بالساعات بعد اختيار العرض، ثم ينتهي الطلب');

create function public.expire_unpaid_awards()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hours integer := coalesce(public.int_setting('payment_window_hours'), 48);
  v_request record;
  v_count integer := 0;
begin
  for v_request in
    select r.id from public.service_requests r
    join public.orders o on o.request_id = r.id
    where r.status = 'awarded_unpaid'
      and o.payment_status = 'unpaid'
      and o.created_at <= now() - make_interval(hours => v_hours)
      -- لا نُنهي طلباً بدأ صاحبه الدفع للتو (الدفع المتأخر بعد الانتهاء يُسترد تلقائياً على أي حال)
      and not exists (
        select 1 from public.payments p
        where p.order_id = o.id and p.status = 'initiated'
          and p.created_at > now() - interval '30 minutes'
      )
    for update of r skip locked
  loop
    perform public.transition_request_as(v_request.id, 'expired', 'system', null,
      format('انتهت مهلة الدفع (%s ساعة) بعد اختيار العرض', v_hours));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.expire_unpaid_awards() from public, anon, authenticated;

select cron.schedule('unpaid-award-expiry', '*/10 * * * *', $$select public.expire_unpaid_awards()$$);

-- إشعار انتهاء مهلة الدفع للطرفين (بدل نص «انتهت مهلة العروض»)
create or replace function public.notify_on_order_event()
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
      if new.from_status = 'awarded_unpaid' then
        perform public.notify_request_members(new.request_id, 'expired',
          'انتهت مهلة الدفع', 'انتهت مهلة دفع طلب ' || v_service || '. يمكنك نشر طلب جديد.');
        perform public.notify_provider(v_provider, new.request_id, 'expired',
          'انتهت مهلة دفع طلب', 'لم يدفع العميل طلب ' || v_service || ' خلال المهلة، فانتهى الطلب.');
      else
        perform public.notify_request_members(new.request_id, 'expired',
          'انتهت مهلة طلبك', 'انتهت مهلة العروض على طلب ' || v_service || ' دون اختيار عرض.');
      end if;
    else
      null;
  end case;
  return new;
end;
$$;
