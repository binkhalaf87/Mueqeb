-- المرحلة 3: الطلبات (مباشر بسعر معلن / مباشر بعرض خاص / عام بعروض مغلقة)
-- وآلة الحالات وسجل الانتقالات والعروض. لا دفع في هذه المرحلة.

-- ============================================================
-- الأنواع
-- ============================================================
create type public.request_mode as enum ('direct_listed', 'direct_quote', 'public');
create type public.request_urgency as enum ('normal', 'urgent');
create type public.request_status as enum (
  'draft',
  'open',
  'awarded_unpaid',
  'paid',
  'awaiting_client',
  'in_progress',
  'delivered',
  'completed',
  'disputed',
  'resolved',
  'cancelled',
  'expired'
);
create type public.bid_status as enum ('submitted', 'withdrawn', 'accepted', 'rejected');

-- ============================================================
-- إعدادات إضافية
-- ============================================================
insert into public.settings (key, value, description) values
  ('award_window_hours', '72', 'مهلة اختيار العميل لعرض بعد انتهاء مهلة العروض (بالساعات)');

-- ============================================================
-- كشف بيانات التواصل في النصوص المرئية للمزوّدين قبل الترسية
-- (جوال، بريد، روابط) — يطابق src/lib/contact-info.ts
-- ============================================================
create function public.contains_contact_info(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_text is not null and (
    -- 9 أرقام متتالية أو أكثر (مع تجاهل المسافات والشرطات) = رقم جوال/هاتف محتمل
    regexp_replace(translate(p_text, '٠١٢٣٤٥٦٧٨٩', '0123456789'), '[\s\-\.\(\)]', '', 'g') ~ '[0-9]{9,}'
    or p_text ~* '[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}'
    or p_text ~* '(https?://|www\.)'
    or p_text ~* '\m[a-z0-9\-]+\.(com|net|org|sa|io|me|info)\M'
  );
$$;

-- ============================================================
-- قاعدة أمان (CLAUDE.md): لا طلب ولا تخزين لكلمات مرور أو رموز تحقق للحسابات الحكومية
-- يطابق src/lib/contact-info.ts
-- ============================================================
create function public.mentions_credentials(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_text is not null and p_text ~* (
    'كلم[ةه]\s*(ال)?(مرور|سر)|رمز\s*(ال)?(تحقق|تفعيل|دخول)|الرقم\s*السري|باسورد|باسوورد'
    || '|\motp\M|password|passcode|verification\s*code'
  );
$$;

-- ============================================================
-- service_requests: الحقول الوصفية فقط (يراها المزوّدون المؤهلون)
-- ============================================================
create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  requester_account_id uuid not null references public.requester_accounts (id) on delete restrict,
  service_type_id uuid not null references public.service_types (id) on delete restrict,
  mode public.request_mode not null,
  target_provider_id uuid references public.providers (id) on delete restrict,
  city text not null check (char_length(city) between 2 and 60),
  urgency public.request_urgency not null default 'normal',
  description text not null default '' check (char_length(description) <= 1000),
  available_docs text[] not null default '{}',
  status public.request_status not null default 'draft',
  bids_deadline timestamptz,
  awarded_bid_id uuid,
  published_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_requests_target check (
    (mode = 'public' and target_provider_id is null)
    or (mode <> 'public' and target_provider_id is not null)
  ),
  constraint service_requests_no_contact_info check (not public.contains_contact_info(description)),
  constraint service_requests_no_credentials check (not public.mentions_credentials(description))
);

create index service_requests_account_idx on public.service_requests (requester_account_id);
create index service_requests_open_idx on public.service_requests (status, service_type_id, city);
create index service_requests_target_idx on public.service_requests (target_provider_id);

create trigger service_requests_set_updated_at
  before update on public.service_requests
  for each row execute function public.set_updated_at();

-- ============================================================
-- request_private_details: بيانات العميل الحساسة في جدول مستقل
-- لا يقرؤها المزوّد إلا بعد ترسية الطلب عليه
-- ============================================================
create table public.request_private_details (
  request_id uuid primary key references public.service_requests (id) on delete cascade,
  contact_name text not null,
  contact_phone text,
  contact_email text,
  establishment_name text,
  cr_number text,
  private_notes text check (
    private_notes is null
    or (char_length(private_notes) <= 2000 and not public.mentions_credentials(private_notes))
  ),
  created_at timestamptz not null default now()
);

-- ============================================================
-- bids: عرض واحد لكل مزوّد على كل طلب (يُعدّل أو يُسحب قبل الترسية)
-- ============================================================
create table public.bids (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  provider_id uuid not null references public.providers (id) on delete restrict,
  fee_halalas integer not null check (fee_halalas > 0),
  expected_gov_fees_halalas integer not null default 0 check (expected_gov_fees_halalas >= 0),
  duration_days integer not null check (duration_days between 1 and 365),
  includes text not null default '' check (char_length(includes) <= 1000),
  needs_from_client text not null default '' check (char_length(needs_from_client) <= 1000),
  status public.bid_status not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, provider_id),
  constraint bids_no_contact_info check (
    not public.contains_contact_info(includes) and not public.contains_contact_info(needs_from_client)
  ),
  constraint bids_no_credentials check (
    not public.mentions_credentials(includes) and not public.mentions_credentials(needs_from_client)
  )
);

comment on column public.bids.expected_gov_fees_halalas is
  'معلوماتي فقط: الرسوم الحكومية لا تمر عبر المنصة ويدفعها العميل بنفسه';

create index bids_provider_idx on public.bids (provider_id);

create trigger bids_set_updated_at
  before update on public.bids
  for each row execute function public.set_updated_at();

alter table public.service_requests
  add constraint service_requests_awarded_bid_fk
  foreign key (awarded_bid_id) references public.bids (id) on delete restrict;

-- ============================================================
-- order_events: سجل كل انتقال حالة
-- ============================================================
create table public.order_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.service_requests (id) on delete cascade,
  from_status public.request_status,
  to_status public.request_status not null,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_role text not null check (actor_role in ('requester', 'provider', 'admin', 'system')),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index order_events_request_idx on public.order_events (request_id, created_at);

-- ============================================================
-- دوال مساعدة للصلاحيات
-- ============================================================
create function public.int_setting(p_key text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (value #>> '{}')::integer from public.settings where key = p_key;
$$;

create function public.is_request_member(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.service_requests r
    join public.establishment_members m on m.account_id = r.requester_account_id
    where r.id = p_request_id and m.user_id = (select auth.uid())
  );
$$;

-- المزوّد الحالي معتمد؟
create function public.current_provider_is_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.providers
    where profile_id = (select auth.uid()) and verification_status = 'approved'
  );
$$;

-- هل المزوّد مؤهل لرؤية الطلب الوصفي؟
-- عام مفتوح في خدماته ومدنه، أو مباشر موجّه إليه، أو قدّم عليه عرضاً
create function public.provider_can_view_request(p_request_id uuid)
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

-- هل رُسي الطلب على المزوّد الحالي؟
create function public.is_awarded_provider(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.service_requests r
    join public.bids b on b.id = r.awarded_bid_id and b.status = 'accepted'
    join public.providers p on p.id = b.provider_id
    where r.id = p_request_id and p.profile_id = (select auth.uid())
  );
$$;

-- ============================================================
-- transition_request: الدالة الوحيدة لتغيير حالة الطلب
-- تتحقق من الانتقال المسموح ومن صلاحية المنفّذ وتسجّل في order_events
-- المنفّذ "system" = استدعاء بلا مستخدم (مهمة مجدولة أو مفتاح الخدمة)
-- ============================================================
create function public.transition_request(
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

  -- تحديد دور المنفّذ بالنسبة لهذا الطلب
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

  -- آلة الحالات (CLAUDE.md): (من → إلى) = الأدوار المسموح لها
  v_allowed := case v_request.status::text || '>' || p_to::text
    when 'draft>open'                    then array['requester', 'system']
    when 'draft>cancelled'               then array['requester', 'admin', 'system']
    when 'open>awarded_unpaid'           then array['requester', 'system']
    when 'open>cancelled'                then array['requester', 'admin']
    when 'open>expired'                  then array['system']
    when 'awarded_unpaid>paid'           then array['system']
    when 'awarded_unpaid>cancelled'      then array['requester', 'admin']
    when 'awarded_unpaid>expired'        then array['system']
    when 'paid>awaiting_client'          then array['provider', 'system']
    when 'paid>cancelled'                then array['admin']
    when 'awaiting_client>in_progress'   then array['provider']
    when 'awaiting_client>cancelled'     then array['admin']
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

  -- شروط إضافية
  if p_to = 'awarded_unpaid' and v_request.awarded_bid_id is null then
    raise exception 'no_awarded_bid' using errcode = '55000';
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
-- create_service_request: إنشاء طلب (draft → open) بالمسارات الثلاثة
-- direct_listed: يُنشأ عرض بالسعر المعلن ويُرسى مباشرة (open → awarded_unpaid)
-- ============================================================
create function public.create_service_request(
  p_requester_account_id uuid,
  p_service_type_id uuid,
  p_mode public.request_mode,
  p_city text,
  p_urgency public.request_urgency default 'normal',
  p_description text default '',
  p_available_docs text[] default '{}',
  p_target_provider_id uuid default null,
  p_private_notes text default null
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

  select * into v_service from public.service_types where id = p_service_type_id and active;
  if not found then
    raise exception 'service_type_not_found' using errcode = 'P0002';
  end if;

  if nullif(trim(p_city), '') is null then
    raise exception 'city_required' using errcode = '22023';
  end if;
  if public.contains_contact_info(p_description) then
    raise exception 'contact_info_not_allowed' using errcode = '22023';
  end if;
  if public.mentions_credentials(p_description) or public.mentions_credentials(p_private_notes) then
    raise exception 'credentials_not_allowed' using errcode = '22023';
  end if;
  if not (coalesce(p_available_docs, '{}') <@ v_service.required_docs) then
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
    description, available_docs, bids_deadline, created_by
  ) values (
    v_account.id, v_service.id, p_mode, p_target_provider_id, trim(p_city), p_urgency,
    coalesce(trim(p_description), ''), coalesce(p_available_docs, '{}'), v_deadline, v_uid
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

-- ============================================================
-- submit_bid: تقديم عرض أو تعديله (upsert) مع كل القواعد
-- ============================================================
create function public.submit_bid(
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

  select min_fee_halalas into v_min from public.service_types where id = v_request.service_type_id;
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

create function public.withdraw_bid(p_bid_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bid public.bids;
  v_status public.request_status;
begin
  select b.* into v_bid
  from public.bids b
  join public.providers p on p.id = b.provider_id and p.profile_id = (select auth.uid())
  where b.id = p_bid_id
  for update of b;
  if not found then
    raise exception 'bid_not_found' using errcode = 'P0002';
  end if;

  select status into v_status from public.service_requests where id = v_bid.request_id;
  if v_bid.status <> 'submitted' or v_status <> 'open' then
    raise exception 'bid_locked' using errcode = '55000';
  end if;

  update public.bids set status = 'withdrawn' where id = p_bid_id;
end;
$$;

-- ============================================================
-- accept_bid: العميل يختار عرضاً → awarded_unpaid
-- ============================================================
create function public.accept_bid(p_bid_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bid public.bids;
  v_request public.service_requests;
begin
  select * into v_bid from public.bids where id = p_bid_id;
  if not found or not public.is_request_member(v_bid.request_id) then
    raise exception 'bid_not_found' using errcode = 'P0002';
  end if;

  select * into v_request from public.service_requests where id = v_bid.request_id for update;
  if v_request.status <> 'open' then
    raise exception 'request_not_open' using errcode = '55000';
  end if;
  if v_bid.status <> 'submitted' then
    raise exception 'bid_not_available' using errcode = '55000';
  end if;

  update public.bids set status = 'accepted' where id = p_bid_id;
  update public.bids set status = 'rejected'
  where request_id = v_request.id and id <> p_bid_id and status = 'submitted';
  update public.service_requests set awarded_bid_id = p_bid_id where id = v_request.id;

  perform public.transition_request(v_request.id, 'awarded_unpaid', 'اختيار عرض');
end;
$$;

-- ============================================================
-- request_bids: عروض الطلب للعميل مع بيانات المقارنة
-- (اسم المكتب من الواجهة العامة؛ التقييم والإنجازات تُفعّل في المرحلة 7)
-- ============================================================
create function public.request_bids(p_request_id uuid)
returns table (
  id uuid,
  provider_id uuid,
  office_name text,
  fee_halalas integer,
  expected_gov_fees_halalas integer,
  duration_days integer,
  includes text,
  needs_from_client text,
  status public.bid_status,
  submitted_at timestamptz,
  response_minutes integer,
  completed_orders integer,
  rating numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_request_member(p_request_id) or public.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    b.id, b.provider_id, p.office_name, b.fee_halalas, b.expected_gov_fees_halalas,
    b.duration_days, b.includes, b.needs_from_client, b.status, b.created_at,
    greatest(0, floor(extract(epoch from (b.created_at - coalesce(r.published_at, r.created_at))) / 60))::integer,
    (
      select count(*)::integer from public.service_requests r2
      join public.bids b2 on b2.id = r2.awarded_bid_id
      where b2.provider_id = b.provider_id and r2.status in ('completed', 'resolved')
    ),
    null::numeric
  from public.bids b
  join public.service_requests r on r.id = b.request_id
  join public.providers p on p.id = b.provider_id
  where b.request_id = p_request_id and b.status <> 'withdrawn'
  order by b.fee_halalas, b.created_at;
end;
$$;

-- ============================================================
-- expire_stale_requests: يُستدعى من المهمة المجدولة
-- open بلا اختيار: بعد المهلة إن لم تصل عروض، أو بعد مهلة الاختيار إن وصلت
-- ============================================================
create function public.expire_stale_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_award_window interval := make_interval(hours => coalesce(public.int_setting('award_window_hours'), 72));
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select r.id from public.service_requests r
    where r.status = 'open'
      and r.bids_deadline is not null
      and (
        r.bids_deadline + v_award_window <= now()
        or (
          r.bids_deadline <= now()
          and not exists (
            select 1 from public.bids b where b.request_id = r.id and b.status = 'submitted'
          )
        )
      )
    for update skip locked
  loop
    perform public.transition_request(v_id, 'expired', 'انتهت المهلة دون اختيار عرض');
    update public.bids set status = 'rejected' where request_id = v_id and status = 'submitted';
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ============================================================
-- صلاحيات الدوال
-- ============================================================
revoke all on function public.transition_request from public, anon;
grant execute on function public.transition_request to authenticated;
revoke all on function public.create_service_request from public, anon;
grant execute on function public.create_service_request to authenticated;
revoke all on function public.submit_bid from public, anon;
grant execute on function public.submit_bid to authenticated;
revoke all on function public.withdraw_bid from public, anon;
grant execute on function public.withdraw_bid to authenticated;
revoke all on function public.accept_bid from public, anon;
grant execute on function public.accept_bid to authenticated;
revoke all on function public.request_bids from public, anon;
grant execute on function public.request_bids to authenticated;
revoke all on function public.expire_stale_requests from public, anon, authenticated;
revoke all on function public.int_setting from public, anon;
grant execute on function public.int_setting to authenticated;

-- ============================================================
-- الجداول: قراءة فقط من الواجهة؛ كل الكتابة عبر الدوال أعلاه
-- ============================================================
revoke all on public.service_requests from anon, authenticated;
grant select on public.service_requests to authenticated;
revoke all on public.request_private_details from anon, authenticated;
grant select on public.request_private_details to authenticated;
revoke all on public.bids from anon, authenticated;
grant select on public.bids to authenticated;
revoke all on public.order_events from anon, authenticated;
grant select on public.order_events to authenticated;

alter table public.service_requests enable row level security;
alter table public.request_private_details enable row level security;
alter table public.bids enable row level security;
alter table public.order_events enable row level security;

create policy "service_requests: members, eligible providers, admin"
  on public.service_requests for select to authenticated
  using (
    (select public.is_request_member(id))
    or (select public.provider_can_view_request(id))
    or (select public.is_admin())
  );

create policy "request_private_details: members, awarded provider, admin"
  on public.request_private_details for select to authenticated
  using (
    (select public.is_request_member(request_id))
    or (select public.is_awarded_provider(request_id))
    or (select public.is_admin())
  );

-- المزوّد يرى صفوفه فقط؛ العميل يرى عروض طلباته؛ الإدارة الكل
create policy "bids: own provider rows, request members, admin"
  on public.bids for select to authenticated
  using (
    provider_id = (select public.current_provider_id())
    or (select public.is_request_member(request_id))
    or (select public.is_admin())
  );

create policy "order_events: members, awarded provider, admin"
  on public.order_events for select to authenticated
  using (
    (select public.is_request_member(request_id))
    or (select public.is_awarded_provider(request_id))
    or (select public.is_admin())
  );

-- ============================================================
-- المهمة المجدولة: كل 5 دقائق (يشغّلها مُجدول التطبيق من جدول cron.job)
-- ============================================================

select cron.schedule(
  'expire-stale-requests',
  '*/5 * * * *',
  $$select public.expire_stale_requests()$$
);
