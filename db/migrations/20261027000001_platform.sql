-- المرحلة 0: أساس المنصة على Postgres عادي (Railway)
-- يوفّر ما تعتمد عليه بقية الـ migrations دون أي خدمة خارجية:
--   * أدوار قاعدة البيانات: anon (زائر)، authenticated (مستخدم مسجّل)، service_role (الخادم، يتجاوز RLS)
--   * auth.users + auth.uid() / auth.role(): هوية المنفّذ تُمرَّر من خادم التطبيق لكل معاملة
--     عبر set_config('request.jwt.claims', ...) مع SET LOCAL ROLE، فتبقى سياسات RLS هي الحَكَم
--   * storage.buckets / storage.objects: بيانات الملفات وسياسات الوصول إليها (المحتوى نفسه على قرص الخادم)
--   * cron.job: المهام المجدولة يعلنها الـ migrations ويشغّلها مُجدول التطبيق

create extension if not exists pgcrypto with schema public;

-- ============================================================
-- الأدوار
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

-- مستخدم الاتصال يتقمّص الدور المناسب لكل معاملة
grant anon, authenticated, service_role to current_user;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- ============================================================
-- الهوية
-- ============================================================
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique check (email is null or email = lower(email)),
  phone text unique check (phone is null or phone ~ '^\+[0-9]{8,15}$'),
  encrypted_password text not null,
  raw_user_meta_data jsonb not null default '{}',
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_identifier check (email is not null or phone is not null)
);

comment on table auth.users is
  'حسابات الدخول. كلمات المرور مُجزّأة بـ bcrypt؛ لا يقرأ الجدول إلا خادم التطبيق (service_role).';

revoke all on auth.users from public, anon, authenticated;
grant select, insert, update, delete on auth.users to service_role;

create function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;

create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

create function auth.role()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'role', '');
$$;

-- ============================================================
-- بيانات الملفات وسياساتها
-- المسار: {folder}/{...}/{file}؛ المحتوى يخزّنه الخادم ويصدر له روابط موقّعة مؤقتة
-- ============================================================
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now()
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets (id),
  name text not null,
  owner uuid default auth.uid(),
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

revoke all on storage.buckets, storage.objects from public, anon, authenticated;
grant select on storage.buckets to anon, authenticated;
-- الزائر يقرأ الجدول بلا نتائج (لا سياسة له) بدل خطأ صلاحية
grant select on storage.objects to anon;
grant select, insert, delete on storage.objects to authenticated;
grant all on storage.buckets, storage.objects to service_role;

create policy "buckets: readable"
  on storage.buckets for select to anon, authenticated
  using (true);

-- مجلدات المسار دون اسم الملف: 'a/b/c.pdf' → {a,b}
create function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1];
$$;

-- ============================================================
-- المهام المجدولة: تُعلن هنا ويشغّلها مُجدول خادم التطبيق (صيغة */N * * * * فقط)
-- ============================================================
create schema cron;
revoke all on schema cron from public;
grant usage on schema cron to service_role;

create table cron.job (
  jobname text primary key,
  schedule text not null check (schedule ~ '^\*/[0-9]+ \* \* \* \*$'),
  command text not null,
  active boolean not null default true,
  last_run_at timestamptz,
  last_error text
);

grant select, update on cron.job to service_role;

create function cron.schedule(job_name text, schedule text, command text)
returns text
language sql
as $$
  insert into cron.job (jobname, schedule, command)
  values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobname;
$$;
