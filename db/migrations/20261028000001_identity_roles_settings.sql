-- المرحلة 1: الهوية والأدوار والإعدادات
-- profiles, requester_accounts, establishment_members, settings + RLS

-- ============================================================
-- الأنواع
-- ============================================================
create type public.user_role as enum ('requester', 'provider', 'admin');
create type public.requester_account_type as enum ('individual', 'establishment');
create type public.establishment_member_role as enum ('owner', 'member');

-- ============================================================
-- profiles: صف لكل مستخدم في auth.users
-- role فارغ حتى يختار المستخدم مساره في شاشة البداية (onboarding)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text check (phone is null or phone ~ '^\+?[0-9]{8,15}$'),
  city text check (city is null or char_length(city) <= 60),
  created_at timestamptz not null default now()
);

comment on column public.profiles.role is
  'يُضبط مرة واحدة عبر complete_onboarding؛ دور admin يُمنح من قاعدة البيانات فقط';

-- ============================================================
-- requester_accounts: حساب طالب الخدمة (فرد أو منشأة)
-- ============================================================
create table public.requester_accounts (
  id uuid primary key default gen_random_uuid(),
  account_type public.requester_account_type not null,
  establishment_name text check (establishment_name is null or char_length(establishment_name) between 2 and 150),
  cr_number text unique check (cr_number is null or cr_number ~ '^[0-9]{10}$'),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint requester_accounts_type_fields check (
    (account_type = 'individual' and establishment_name is null and cr_number is null)
    or (account_type = 'establishment' and establishment_name is not null and cr_number is not null)
  )
);

-- ============================================================
-- establishment_members: ربط المستخدمين بحساب طالب الخدمة
-- الحساب الفردي له عضو واحد (owner)، والمنشأة قد يكون لها أكثر من عضو
-- ============================================================
create table public.establishment_members (
  account_id uuid not null references public.requester_accounts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  member_role public.establishment_member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (account_id, user_id)
);

create index establishment_members_user_id_idx on public.establishment_members (user_id);

-- ============================================================
-- settings: إعدادات المنصة (مفتاح/قيمة)
-- ============================================================
create table public.settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

insert into public.settings (key, value, description) values
  ('provider_commission_pct', '15', 'نسبة عمولة المنصة من أتعاب المزوّد'),
  ('client_fee_pct', '5', 'نسبة رسم الخدمة على العميل'),
  ('max_offers_per_order', '7', 'الحد الأقصى للعروض على الطلب العام'),
  ('offer_window_hours', '24', 'مهلة تقديم العروض بالساعات'),
  ('delivery_confirmation_days', '3', 'مهلة تأكيد العميل للتسليم بالأيام');

-- ============================================================
-- دوال مساعدة (security definer لتجنب التكرار في سياسات RLS)
-- ============================================================
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

create function public.is_account_member(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.establishment_members
    where account_id = p_account_id and user_id = (select auth.uid())
  );
$$;

create function public.is_account_owner(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.establishment_members
    where account_id = p_account_id
      and user_id = (select auth.uid())
      and member_role = 'owner'
  );
$$;

-- ============================================================
-- إنشاء profile تلقائياً عند التسجيل
-- ============================================================
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(left(trim(new.raw_user_meta_data ->> 'full_name'), 120), ''),
    nullif(new.phone, '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- complete_onboarding: الطريقة الوحيدة لاختيار الدور من الواجهة
-- تعمل مرة واحدة فقط (عندما يكون role فارغاً) ولا تسمح بدور admin
-- ============================================================
create function public.complete_onboarding(
  p_role public.user_role,
  p_account_type public.requester_account_type default null,
  p_establishment_name text default null,
  p_cr_number text default null,
  p_city text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_account_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_role is null or p_role = 'admin' then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  -- قفل الصف لمنع الاستدعاء المتزامن
  perform 1 from public.profiles where id = v_uid and role is null for update;
  if not found then
    raise exception 'already_onboarded' using errcode = '55000';
  end if;

  if p_role = 'requester' then
    if p_account_type is null then
      raise exception 'account_type_required' using errcode = '22023';
    end if;

    insert into public.requester_accounts (account_type, establishment_name, cr_number, created_by)
    values (
      p_account_type,
      case when p_account_type = 'establishment' then nullif(trim(p_establishment_name), '') end,
      case when p_account_type = 'establishment' then nullif(trim(p_cr_number), '') end,
      v_uid
    )
    returning id into v_account_id;

    insert into public.establishment_members (account_id, user_id, member_role)
    values (v_account_id, v_uid, 'owner');
  end if;

  update public.profiles
  set role = p_role,
      city = coalesce(nullif(trim(p_city), ''), city)
  where id = v_uid;
end;
$$;

revoke all on function public.complete_onboarding from public, anon;
grant execute on function public.complete_onboarding to authenticated;

revoke all on function public.handle_new_user from public, anon, authenticated;

-- ============================================================
-- الصلاحيات على مستوى الأعمدة: المستخدم لا يعدّل role ولا id
-- ============================================================
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone, city) on public.profiles to authenticated;

revoke all on public.requester_accounts from anon, authenticated;
grant select on public.requester_accounts to authenticated;
grant update (establishment_name) on public.requester_accounts to authenticated;

revoke all on public.establishment_members from anon, authenticated;
grant select on public.establishment_members to authenticated;

revoke all on public.settings from anon, authenticated;
grant select on public.settings to authenticated;
grant update (value, description, updated_at) on public.settings to authenticated;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.requester_accounts enable row level security;
alter table public.establishment_members enable row level security;
alter table public.settings enable row level security;

-- profiles
create policy "profiles: read own or admin"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- requester_accounts
create policy "requester_accounts: read as member or admin"
  on public.requester_accounts for select to authenticated
  using ((select public.is_account_member(id)) or (select public.is_admin()));

create policy "requester_accounts: owner updates"
  on public.requester_accounts for update to authenticated
  using ((select public.is_account_owner(id)))
  with check ((select public.is_account_owner(id)));

-- establishment_members
create policy "establishment_members: read own, own account's, or admin"
  on public.establishment_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_account_owner(account_id))
    or (select public.is_admin())
  );

-- settings: يقرأها كل مستخدم مسجّل (نسب الرسوم تُعرض للعميل)، وتعدّلها الإدارة فقط
create policy "settings: read authenticated"
  on public.settings for select to authenticated
  using (true);

create policy "settings: admin updates"
  on public.settings for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
