-- المرحلة 2: كتالوج الخدمات، ملفات المزوّدين، التوثيق، خدمات المزوّد وأسعارها
-- كل المبالغ بالهللة (integer)

-- ============================================================
-- الأنواع
-- ============================================================
create type public.delegation_platform as enum ('qiwa', 'balady', 'mc', 'none');
create type public.provider_verification_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type public.provider_document_type as enum (
  'commercial_register',
  'municipal_license',
  'manager_id',
  'iban_certificate'
);

-- ============================================================
-- كتالوج الخدمات
-- ============================================================
create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z][a-z0-9_]*$'),
  name_ar text not null check (char_length(name_ar) between 2 and 80),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.service_types (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.service_categories (id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z][a-z0-9_]*$'),
  name_ar text not null check (char_length(name_ar) between 2 and 120),
  description text check (description is null or char_length(description) <= 500),
  min_fee_halalas integer not null check (min_fee_halalas > 0),
  guide_min_halalas integer not null,
  guide_max_halalas integer not null,
  required_docs text[] not null default '{}',
  delegation_platform public.delegation_platform not null default 'none',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint service_types_guide_range check (
    guide_min_halalas >= min_fee_halalas and guide_max_halalas >= guide_min_halalas
  )
);

create index service_types_category_id_idx on public.service_types (category_id);

-- ============================================================
-- providers: ملف المزوّد (مكتب خدمات عامة)
-- pending + submitted_at فارغ = مسودة؛ pending + submitted_at = في طابور التوثيق
-- ============================================================
create table public.providers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  office_name text not null check (char_length(office_name) between 2 and 150),
  cr_number text not null unique check (cr_number ~ '^[0-9]{10}$'),
  municipal_license_number text not null check (municipal_license_number ~ '^[0-9A-Za-z-]{4,30}$'),
  cities text[] not null default '{}' check (cardinality(cities) <= 30),
  bio text check (bio is null or char_length(bio) <= 1000),
  verification_status public.provider_verification_status not null default 'pending',
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 500),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.providers.rejection_reason is
  'سبب الرفض أو الإيقاف؛ يُمسح عند إعادة الإرسال أو الاعتماد';

create index providers_status_idx on public.providers (verification_status);
create index providers_cities_idx on public.providers using gin (cities);

-- ============================================================
-- provider_documents: مستند واحد من كل نوع لكل مزوّد (الاستبدال يحدّث الصف)
-- ============================================================
create table public.provider_documents (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  doc_type public.provider_document_type not null,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) <= 200),
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  uploaded_at timestamptz not null default now(),
  unique (provider_id, doc_type)
);

-- ============================================================
-- provider_services: خدمات المزوّد وأسعارها («يبدأ من»)
-- ============================================================
create table public.provider_services (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  service_type_id uuid not null references public.service_types (id) on delete restrict,
  fee_halalas integer not null check (fee_halalas > 0),
  duration_days integer not null check (duration_days between 1 and 365),
  notes text check (notes is null or char_length(notes) <= 500),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, service_type_id)
);

create index provider_services_service_type_idx on public.provider_services (service_type_id);

-- ============================================================
-- دوال مساعدة
-- ============================================================
create function public.current_provider_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.providers where profile_id = (select auth.uid());
$$;

-- المزوّد يعدّل بيانات هويته ومستنداته فقط وهو مسودة أو مرفوض
create function public.provider_is_editable(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.providers
    where id = p_provider_id
      and (
        (verification_status = 'pending' and submitted_at is null)
        or verification_status = 'rejected'
      )
  );
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger providers_set_updated_at
  before update on public.providers
  for each row execute function public.set_updated_at();

create trigger provider_services_set_updated_at
  before update on public.provider_services
  for each row execute function public.set_updated_at();

-- منع تعديل بيانات الهوية من المزوّد بعد الإرسال للتوثيق
create function public.guard_provider_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
    and (
      new.office_name is distinct from old.office_name
      or new.cr_number is distinct from old.cr_number
      or new.municipal_license_number is distinct from old.municipal_license_number
    )
    and not (
      (old.verification_status = 'pending' and old.submitted_at is null)
      or old.verification_status = 'rejected'
    )
  then
    raise exception 'provider_identity_locked' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger providers_guard_identity
  before update on public.providers
  for each row execute function public.guard_provider_identity();

-- رفض السعر تحت الحد الأدنى لنوع الخدمة
create function public.check_provider_service_fee()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_min integer;
  v_active boolean;
begin
  select min_fee_halalas, active into v_min, v_active
  from public.service_types where id = new.service_type_id;

  if v_min is null then
    raise exception 'service_type_not_found' using errcode = '23503';
  end if;
  if tg_op = 'INSERT' and not v_active then
    raise exception 'service_type_inactive' using errcode = '22023';
  end if;
  if new.fee_halalas < v_min then
    raise exception 'fee_below_minimum' using errcode = '23514',
      detail = format('min_fee_halalas=%s', v_min);
  end if;
  return new;
end;
$$;

create trigger provider_services_check_fee
  before insert or update on public.provider_services
  for each row execute function public.check_provider_service_fee();

-- ============================================================
-- submit_provider_for_review: يتطلب المستندات الأربعة
-- ============================================================
create function public.submit_provider_for_review()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider public.providers;
  v_doc_count integer;
begin
  select * into v_provider from public.providers
  where profile_id = (select auth.uid())
  for update;

  if not found then
    raise exception 'provider_not_found' using errcode = 'P0002';
  end if;
  if not (
    (v_provider.verification_status = 'pending' and v_provider.submitted_at is null)
    or v_provider.verification_status = 'rejected'
  ) then
    raise exception 'invalid_status' using errcode = '55000';
  end if;
  if cardinality(v_provider.cities) = 0 then
    raise exception 'cities_required' using errcode = '22023';
  end if;

  select count(distinct doc_type) into v_doc_count
  from public.provider_documents where provider_id = v_provider.id;
  if v_doc_count < 4 then
    raise exception 'documents_incomplete' using errcode = '22023';
  end if;

  update public.providers
  set verification_status = 'pending',
      submitted_at = now(),
      rejection_reason = null
  where id = v_provider.id;
end;
$$;

-- ============================================================
-- review_provider: إجراءات الإدارة
-- approve: من pending (مُرسل) أو suspended | reject: من pending (مُرسل) مع سبب
-- suspend: من approved مع سبب
-- ============================================================
create function public.review_provider(
  p_provider_id uuid,
  p_action text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider public.providers;
  v_reason text := nullif(trim(p_reason), '');
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_provider from public.providers where id = p_provider_id for update;
  if not found then
    raise exception 'provider_not_found' using errcode = 'P0002';
  end if;

  if p_action = 'approve' then
    if not (
      (v_provider.verification_status = 'pending' and v_provider.submitted_at is not null)
      or v_provider.verification_status = 'suspended'
    ) then
      raise exception 'invalid_status' using errcode = '55000';
    end if;
    update public.providers
    set verification_status = 'approved', rejection_reason = null,
        reviewed_at = now(), reviewed_by = auth.uid()
    where id = p_provider_id;

  elsif p_action = 'reject' then
    if not (v_provider.verification_status = 'pending' and v_provider.submitted_at is not null) then
      raise exception 'invalid_status' using errcode = '55000';
    end if;
    if v_reason is null then
      raise exception 'reason_required' using errcode = '22023';
    end if;
    update public.providers
    set verification_status = 'rejected', rejection_reason = left(v_reason, 500),
        reviewed_at = now(), reviewed_by = auth.uid()
    where id = p_provider_id;

  elsif p_action = 'suspend' then
    if v_provider.verification_status <> 'approved' then
      raise exception 'invalid_status' using errcode = '55000';
    end if;
    if v_reason is null then
      raise exception 'reason_required' using errcode = '22023';
    end if;
    update public.providers
    set verification_status = 'suspended', rejection_reason = left(v_reason, 500),
        reviewed_at = now(), reviewed_by = auth.uid()
    where id = p_provider_id;

  else
    raise exception 'invalid_action' using errcode = '22023';
  end if;
end;
$$;

-- ============================================================
-- واجهة عامة: المزوّدون المعتمدون فقط وبالحقول الآمنة فقط
-- (السجل التجاري والرخصة وأسباب الرفض لا تُكشف)
-- ============================================================
create function public.public_providers(
  p_service_type_id uuid default null,
  p_city text default null
)
returns table (
  id uuid,
  office_name text,
  cities text[],
  bio text,
  services_count bigint,
  from_fee_halalas integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.office_name,
    p.cities,
    p.bio,
    count(ps.id) as services_count,
    min(ps.fee_halalas)::integer as from_fee_halalas
  from public.providers p
  join public.provider_services ps on ps.provider_id = p.id and ps.active
  join public.service_types st on st.id = ps.service_type_id and st.active
  where p.verification_status = 'approved'
    and (p_city is null or p_city = any (p.cities))
    and (p_service_type_id is null or ps.service_type_id = p_service_type_id)
  group by p.id
  order by p.office_name;
$$;

create function public.public_provider(p_provider_id uuid)
returns table (
  id uuid,
  office_name text,
  cities text[],
  bio text,
  approved_since timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.office_name, p.cities, p.bio, p.reviewed_at
  from public.providers p
  where p.id = p_provider_id and p.verification_status = 'approved';
$$;

create function public.public_provider_services(p_provider_id uuid)
returns table (
  id uuid,
  service_type_id uuid,
  service_name text,
  category_name text,
  fee_halalas integer,
  duration_days integer,
  notes text
)
language sql
stable
security definer
set search_path = ''
as $$
  select ps.id, st.id, st.name_ar, sc.name_ar, ps.fee_halalas, ps.duration_days, ps.notes
  from public.provider_services ps
  join public.providers p on p.id = ps.provider_id and p.verification_status = 'approved'
  join public.service_types st on st.id = ps.service_type_id and st.active
  join public.service_categories sc on sc.id = st.category_id
  where ps.provider_id = p_provider_id and ps.active
  order by sc.sort_order, st.sort_order;
$$;

revoke all on function public.submit_provider_for_review from public, anon;
grant execute on function public.submit_provider_for_review to authenticated;
revoke all on function public.review_provider from public, anon;
grant execute on function public.review_provider to authenticated;
grant execute on function public.public_providers to anon, authenticated;
grant execute on function public.public_provider to anon, authenticated;
grant execute on function public.public_provider_services to anon, authenticated;

-- ============================================================
-- الصلاحيات على مستوى الأعمدة
-- ============================================================
revoke all on public.service_categories from anon, authenticated;
grant select on public.service_categories to anon, authenticated;

revoke all on public.service_types from anon, authenticated;
grant select on public.service_types to anon, authenticated;

revoke all on public.providers from anon, authenticated;
grant select on public.providers to authenticated;
grant insert (profile_id, office_name, cr_number, municipal_license_number, cities, bio)
  on public.providers to authenticated;
grant update (office_name, cr_number, municipal_license_number, cities, bio)
  on public.providers to authenticated;

revoke all on public.provider_documents from anon, authenticated;
grant select, delete on public.provider_documents to authenticated;
grant insert (provider_id, doc_type, storage_path, file_name, mime_type, size_bytes)
  on public.provider_documents to authenticated;
grant update (storage_path, file_name, mime_type, size_bytes, uploaded_at)
  on public.provider_documents to authenticated;

revoke all on public.provider_services from anon, authenticated;
grant select, delete on public.provider_services to authenticated;
grant insert (provider_id, service_type_id, fee_halalas, duration_days, notes, active)
  on public.provider_services to authenticated;
grant update (fee_halalas, duration_days, notes, active)
  on public.provider_services to authenticated;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.service_categories enable row level security;
alter table public.service_types enable row level security;
alter table public.providers enable row level security;
alter table public.provider_documents enable row level security;
alter table public.provider_services enable row level security;

-- الكتالوج: الفعّال للجميع، والكل للإدارة (التعديل عبر migrations حالياً)
create policy "service_categories: read active or admin"
  on public.service_categories for select to anon, authenticated
  using (active or (select public.is_admin()));

create policy "service_types: read active or admin"
  on public.service_types for select to anon, authenticated
  using (active or (select public.is_admin()));

-- providers
create policy "providers: read own or admin"
  on public.providers for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_admin()));

create policy "providers: provider creates own"
  on public.providers for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'provider'
    )
  );

create policy "providers: update own"
  on public.providers for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- provider_documents: المالك والإدارة فقط
create policy "provider_documents: read own or admin"
  on public.provider_documents for select to authenticated
  using (provider_id = (select public.current_provider_id()) or (select public.is_admin()));

create policy "provider_documents: insert own while editable"
  on public.provider_documents for insert to authenticated
  with check (
    provider_id = (select public.current_provider_id())
    and (select public.provider_is_editable(provider_id))
  );

create policy "provider_documents: update own while editable"
  on public.provider_documents for update to authenticated
  using (
    provider_id = (select public.current_provider_id())
    and (select public.provider_is_editable(provider_id))
  )
  with check (provider_id = (select public.current_provider_id()));

create policy "provider_documents: delete own while editable"
  on public.provider_documents for delete to authenticated
  using (
    provider_id = (select public.current_provider_id())
    and (select public.provider_is_editable(provider_id))
  );

-- provider_services: المالك يدير خدماته في أي حالة، والإدارة تقرأ
create policy "provider_services: read own or admin"
  on public.provider_services for select to authenticated
  using (provider_id = (select public.current_provider_id()) or (select public.is_admin()));

create policy "provider_services: insert own"
  on public.provider_services for insert to authenticated
  with check (provider_id = (select public.current_provider_id()));

create policy "provider_services: update own"
  on public.provider_services for update to authenticated
  using (provider_id = (select public.current_provider_id()))
  with check (provider_id = (select public.current_provider_id()));

create policy "provider_services: delete own"
  on public.provider_services for delete to authenticated
  using (provider_id = (select public.current_provider_id()));

-- ============================================================
-- Storage: bucket خاص لمستندات المزوّدين
-- المسار: {provider_id}/{doc_type}-{uuid}.{ext}
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'provider-documents',
  'provider-documents',
  false,
  5242880,
  array['application/pdf', 'image/jpeg', 'image/png']
);

create policy "provider-documents: owner or admin reads"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'provider-documents'
    and (
      (storage.foldername(name))[1] = (select public.current_provider_id())::text
      or (select public.is_admin())
    )
  );

create policy "provider-documents: owner uploads while editable"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'provider-documents'
    and (storage.foldername(name))[1] = (select public.current_provider_id())::text
    and (select public.provider_is_editable(public.current_provider_id()))
  );

create policy "provider-documents: owner deletes while editable"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'provider-documents'
    and (storage.foldername(name))[1] = (select public.current_provider_id())::text
    and (select public.provider_is_editable(public.current_provider_id()))
  );
