-- الطلب العام بنص حر: عنوان وجهة معنية بدل اختيار خدمة من قائمة، مع مرفقات توضيحية اختيارية.
-- الطلب المباشر (من ملف مكتب) يبقى مرتبطاً بخدمة محددة وسعرها المعلن.

alter table public.service_requests
  add column title text check (title is null or char_length(title) between 5 and 120),
  add column authority text check (authority is null or char_length(authority) between 2 and 80),
  alter column service_type_id drop not null,
  add constraint service_requests_service_or_title check (
    service_type_id is not null
    or (mode = 'public' and title is not null and authority is not null)
  );

-- اسم الطلب للعرض والإشعارات: اسم الخدمة إن وُجدت، وإلا عنوان العميل
create function public.request_label(p_request_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(t.name_ar, r.title, 'طلب')
  from public.service_requests r
  left join public.service_types t on t.id = r.service_type_id
  where r.id = p_request_id;
$$;
revoke all on function public.request_label from public, anon, authenticated;

-- من يرى الطلب: الطلب العام بلا خدمة محددة يظهر لكل مكتب معتمد
create or replace function public.provider_can_view_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.service_requests r
    join public.providers p
      on p.profile_id = (select auth.uid()) and p.verification_status = 'approved'
    where r.id = p_request_id
      and (
        r.target_provider_id = p.id
        or exists (select 1 from public.bids b where b.request_id = r.id and b.provider_id = p.id)
        or (r.mode = 'public' and r.status = 'open' and r.service_type_id is null)
        or (
          r.mode = 'public'
          and r.status = 'open'
          and r.city = any (p.cities)
          and exists (
            select 1 from public.provider_services ps
            where ps.provider_id = p.id and ps.service_type_id = r.service_type_id and ps.active
          )
        )
      )
  );
$$;

-- إنشاء الطلب: إصدار جديد بالعنوان والجهة
drop function public.create_service_request(uuid, uuid, public.request_mode, text, public.request_urgency, text, text[], uuid, text);

create function public.create_service_request(
  p_requester_account_id uuid,
  p_service_type_id uuid,
  p_mode public.request_mode,
  p_city text,
  p_urgency public.request_urgency default 'normal',
  p_description text default '',
  p_available_docs text[] default '{}',
  p_target_provider_id uuid default null,
  p_private_notes text default null,
  p_title text default null,
  p_authority text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_service public.service_types;
  v_listed public.provider_services;
  v_account public.requester_accounts;
  v_profile public.profiles;
  v_request_id uuid;
  v_bid_id uuid;
  v_deadline timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.role is distinct from 'requester' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select a.* into v_account
  from public.requester_accounts a
  join public.establishment_members m on m.account_id = a.id and m.user_id = v_uid
  where a.id = p_requester_account_id;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- الطلب العام قد يكون عاماً بلا خدمة محددة (عنوان وجهة نصيان)؛ المباشر يتطلب خدمة دائماً
  if p_service_type_id is not null then
    select * into v_service from public.service_types where id = p_service_type_id and active;
    if not found then
      raise exception 'service_type_not_found' using errcode = 'P0002';
    end if;
  elsif p_mode <> 'public' then
    raise exception 'service_type_not_found' using errcode = 'P0002';
  else
    if char_length(coalesce(trim(p_title), '')) not between 5 and 120 then
      raise exception 'title_required' using errcode = '22023';
    end if;
    if char_length(coalesce(trim(p_authority), '')) not between 2 and 80 then
      raise exception 'authority_required' using errcode = '22023';
    end if;
  end if;

  if nullif(trim(p_city), '') is null then
    raise exception 'city_required' using errcode = '22023';
  end if;
  if public.contains_contact_info(p_description) or public.contains_contact_info(p_title)
     or public.contains_contact_info(p_authority) then
    raise exception 'contact_info_not_allowed' using errcode = '22023';
  end if;
  if public.mentions_credentials(p_description) or public.mentions_credentials(p_private_notes)
     or public.mentions_credentials(p_title) or public.mentions_credentials(p_authority) then
    raise exception 'credentials_not_allowed' using errcode = '22023';
  end if;
  if not (coalesce(p_available_docs, '{}') <@ coalesce(v_service.required_docs, '{}')) then
    raise exception 'invalid_available_docs' using errcode = '22023';
  end if;

  if p_mode = 'public' then
    if p_target_provider_id is not null then
      raise exception 'public_request_has_no_target' using errcode = '22023';
    end if;
  else
    -- المزوّد المستهدف معتمد ويقدّم الخدمة
    select ps.* into v_listed
    from public.provider_services ps
    join public.providers p on p.id = ps.provider_id and p.verification_status = 'approved'
    where ps.provider_id = p_target_provider_id
      and ps.service_type_id = p_service_type_id
      and ps.active;
    if not found then
      raise exception 'provider_does_not_offer_service' using errcode = '22023';
    end if;
  end if;

  if p_mode <> 'direct_listed' then
    v_deadline := now() + make_interval(hours => coalesce(public.int_setting('offer_window_hours'), 24));
  end if;

  insert into public.service_requests (
    requester_account_id, service_type_id, mode, target_provider_id, city, urgency,
    description, available_docs, bids_deadline, created_by, title, authority
  ) values (
    v_account.id, v_service.id, p_mode, p_target_provider_id, trim(p_city), p_urgency,
    coalesce(trim(p_description), ''), coalesce(p_available_docs, '{}'), v_deadline, v_uid,
    nullif(trim(p_title), ''), nullif(trim(p_authority), '')
  )
  returning id into v_request_id;

  insert into public.request_private_details (
    request_id, contact_name, contact_phone, contact_email, establishment_name, cr_number, private_notes
  ) values (
    v_request_id,
    v_profile.full_name,
    v_profile.phone,
    (select email from auth.users where id = v_uid),
    v_account.establishment_name,
    v_account.cr_number,
    nullif(trim(p_private_notes), '')
  );

  perform public.transition_request(v_request_id, 'open');

  if p_mode = 'direct_listed' then
    insert into public.bids (request_id, provider_id, fee_halalas, duration_days, includes, status)
    values (
      v_request_id, v_listed.provider_id, v_listed.fee_halalas, v_listed.duration_days,
      coalesce(v_listed.notes, ''), 'accepted'
    )
    returning id into v_bid_id;

    update public.service_requests set awarded_bid_id = v_bid_id where id = v_request_id;
    perform public.transition_request(v_request_id, 'awarded_unpaid', 'طلب بالسعر المعلن');
  end if;

  return v_request_id;
end;
$$;

revoke all on function public.create_service_request from public, anon;
grant execute on function public.create_service_request to authenticated;

-- العروض: لا حد أدنى للأتعاب للطلب العام بلا خدمة
create or replace function public.submit_bid(
  p_request_id uuid,
  p_fee_halalas integer,
  p_expected_gov_fees_halalas integer,
  p_duration_days integer,
  p_includes text default '',
  p_needs_from_client text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider public.providers;
  v_request public.service_requests;
  v_min integer;
  v_existing public.bids;
  v_active_count integer;
  v_max integer := coalesce(public.int_setting('max_offers_per_order'), 7);
  v_bid_id uuid;
begin
  select * into v_provider from public.providers
  where profile_id = (select auth.uid()) and verification_status = 'approved';
  if not found then
    raise exception 'provider_not_approved' using errcode = '42501';
  end if;

  -- قفل الطلب يمنع تجاوز حد العروض عند التقديم المتزامن
  select * into v_request from public.service_requests where id = p_request_id for update;
  if not found or not public.provider_can_view_request(p_request_id) then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  if v_request.mode = 'direct_listed' then
    raise exception 'bids_not_allowed' using errcode = '55000';
  end if;
  if v_request.mode = 'direct_quote' and v_request.target_provider_id <> v_provider.id then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  if v_request.status <> 'open' then
    raise exception 'request_not_open' using errcode = '55000';
  end if;
  if v_request.bids_deadline is not null and v_request.bids_deadline <= now() then
    raise exception 'bids_deadline_passed' using errcode = '55000';
  end if;

  select coalesce((select min_fee_halalas from public.service_types where id = v_request.service_type_id), 0) into v_min;
  if p_fee_halalas is null or p_fee_halalas < v_min then
    raise exception 'fee_below_minimum' using errcode = '23514';
  end if;
  if public.contains_contact_info(p_includes) or public.contains_contact_info(p_needs_from_client) then
    raise exception 'contact_info_not_allowed' using errcode = '22023';
  end if;
  if public.mentions_credentials(p_includes) or public.mentions_credentials(p_needs_from_client) then
    raise exception 'credentials_not_allowed' using errcode = '22023';
  end if;

  select * into v_existing from public.bids
  where request_id = p_request_id and provider_id = v_provider.id;

  if not found or v_existing.status = 'withdrawn' then
    select count(*) into v_active_count from public.bids
    where request_id = p_request_id and status = 'submitted';
    if v_active_count >= v_max then
      raise exception 'bids_limit_reached' using errcode = '55000';
    end if;
  elsif v_existing.status <> 'submitted' then
    raise exception 'bid_locked' using errcode = '55000';
  end if;

  insert into public.bids as b (
    request_id, provider_id, fee_halalas, expected_gov_fees_halalas, duration_days,
    includes, needs_from_client, status
  ) values (
    p_request_id, v_provider.id, p_fee_halalas, coalesce(p_expected_gov_fees_halalas, 0),
    p_duration_days, coalesce(trim(p_includes), ''), coalesce(trim(p_needs_from_client), ''), 'submitted'
  )
  on conflict (request_id, provider_id) do update
  set fee_halalas = excluded.fee_halalas,
      expected_gov_fees_halalas = excluded.expected_gov_fees_halalas,
      duration_days = excluded.duration_days,
      includes = excluded.includes,
      needs_from_client = excluded.needs_from_client,
      status = 'submitted',
      created_at = case when b.status = 'withdrawn' then now() else b.created_at end
  returning id into v_bid_id;

  return v_bid_id;
end;
$$;

-- النصوص التي تذكر الطلب: عنوان العميل حين لا توجد خدمة محددة
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
  v_service := public.request_label(v_request.id);
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
        'اختار العميل عرضك', 'خدمة: ' || v_service || ' — بانتظار دفع العميل.');
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

create or replace function public.notify_on_bid()
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
  v_service := public.request_label(new.request_id);
  perform public.notify_request_members(new.request_id, 'new_bid',
    'عرض جديد على طلبك', 'وصل عرض جديد على طلب ' || v_service || '. قارن العروض واختر.');
  return new;
end;
$$;

create or replace function public.remind_confirmation_deadlines()
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
    select r.id, public.request_label(r.id) as name_ar
    from public.service_requests r
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

create or replace function public.provider_withdraw(
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

  v_service := public.request_label(v_request.id);
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

-- التقييمات العامة: الجهة بدل عنوان العميل للطلب العام
create or replace function public.provider_reviews(p_provider_id uuid, p_limit integer default 20)
returns table (
  id uuid,
  speed smallint,
  accuracy smallint,
  communication smallint,
  comment text,
  created_at timestamptz,
  service_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select rv.id, rv.speed, rv.accuracy, rv.communication, rv.comment, rv.created_at,
         coalesce(st.name_ar, r.authority)
  from public.reviews rv
  join public.service_requests r on r.id = rv.request_id
  left join public.service_types st on st.id = r.service_type_id
  join public.providers p on p.id = rv.provider_id and p.verification_status = 'approved'
  where rv.provider_id = p_provider_id
    and rv.reviewer_role = 'requester'
    and public.reviews_revealed(rv.request_id)
  order by rv.created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

-- ============================================================
-- المرفقات التوضيحية: يرفعها العميل والطلب مفتوح (5 كحد أقصى)،
-- ويراها كل مكتب يرى الطلب قبل اختيار العرض (بقرار صاحب المنصة)
-- ============================================================
-- عدد المرفقات (بهوية الخادم لتفادي تكرار سياسات RLS على الجدول نفسه)
create function public.request_attachment_count(p_request_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.request_documents
  where request_id = p_request_id and kind = 'request_attachment';
$$;
revoke all on function public.request_attachment_count from public, anon;
grant execute on function public.request_attachment_count to authenticated;

create policy "request_documents: client attaches to open request"
  on public.request_documents for insert to authenticated
  with check (
    kind = 'request_attachment'
    and uploaded_by = (select auth.uid())
    and (select public.is_request_member(request_id))
    and exists (select 1 from public.service_requests r
                where r.id = request_id and r.status = 'open')
    and public.request_attachment_count(request_id) < 5
  );

create policy "request_documents: eligible providers read attachments"
  on public.request_documents for select to authenticated
  using (kind = 'request_attachment' and (select public.provider_can_view_request(request_id)));

create policy "request-documents: client attaches"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'request-documents'
    and (storage.foldername(name))[2] = 'request_attachment'
    and public.is_request_member(((storage.foldername(name))[1])::uuid)
    and exists (select 1 from public.service_requests r
                where r.id = ((storage.foldername(name))[1])::uuid and r.status = 'open')
  );

create policy "request-documents: eligible providers read attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'request-documents'
    and (storage.foldername(name))[2] = 'request_attachment'
    and public.provider_can_view_request(((storage.foldername(name))[1])::uuid)
  );
