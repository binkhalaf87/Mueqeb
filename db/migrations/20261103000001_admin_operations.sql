-- المرحلة 7: أدوات الإدارة
-- مؤشرات من الدفتر، صرف المستحقات، سجل تدقيق التغييرات، إدارة الخدمات، إيقاف المستخدمين

-- ============================================================
-- سجل التدقيق: من غيّر ماذا ومتى، والقيمة القديمة والجديدة (append-only)
-- ============================================================
create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  entity text not null check (entity in ('setting', 'delegation_guide', 'service_type', 'user', 'provider', 'payout')),
  entity_key text not null,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  reason text,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);

create function public.audit_block_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log_is_append_only' using errcode = '42501';
end;
$$;

create trigger admin_audit_log_no_update_delete
  before update or delete on public.admin_audit_log
  for each row execute function public.audit_block_mutation();

-- الإعدادات
create function public.audit_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.value is distinct from old.value then
    insert into public.admin_audit_log (entity, entity_key, action, old_value, new_value, actor_id)
    values ('setting', new.key, 'update', old.value, new.value, auth.uid());
  end if;
  return new;
end;
$$;

create trigger settings_audit
  after update on public.settings
  for each row execute function public.audit_settings();

-- إرشادات التفويض
create function public.audit_delegation_guides()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.title, new.steps) is distinct from (old.title, old.steps) then
    insert into public.admin_audit_log (entity, entity_key, action, old_value, new_value, actor_id)
    values ('delegation_guide', new.platform::text, 'update',
            jsonb_build_object('title', old.title, 'steps', to_jsonb(old.steps)),
            jsonb_build_object('title', new.title, 'steps', to_jsonb(new.steps)),
            auth.uid());
  end if;
  return new;
end;
$$;

create trigger delegation_guides_audit
  after update on public.delegation_guides
  for each row execute function public.audit_delegation_guides();

-- أنواع الخدمات
create function public.audit_service_types()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) - 'created_at' end;
  v_new jsonb := to_jsonb(new) - 'created_at';
begin
  if v_old is distinct from v_new then
    insert into public.admin_audit_log (entity, entity_key, action, old_value, new_value, actor_id)
    values ('service_type', new.slug, lower(tg_op), v_old, v_new, auth.uid());
  end if;
  return new;
end;
$$;

create trigger service_types_audit
  after insert or update on public.service_types
  for each row execute function public.audit_service_types();

-- حالة توثيق المزوّد (اعتماد/رفض/إيقاف)
create function public.audit_provider_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.verification_status is distinct from old.verification_status then
    insert into public.admin_audit_log (entity, entity_key, action, old_value, new_value, reason, actor_id)
    values ('provider', new.id::text, 'status',
            to_jsonb(old.verification_status::text), to_jsonb(new.verification_status::text),
            new.rejection_reason, coalesce(auth.uid(), new.reviewed_by));
  end if;
  return new;
end;
$$;

create trigger providers_status_audit
  after update of verification_status on public.providers
  for each row execute function public.audit_provider_status();

-- ============================================================
-- إدارة أنواع الخدمات: الإدارة فقط
-- ============================================================
grant insert (category_id, slug, name_ar, description, min_fee_halalas, guide_min_halalas,
              guide_max_halalas, required_docs, delegation_platform, sort_order, active)
  on public.service_types to authenticated;
grant update (name_ar, description, min_fee_halalas, guide_min_halalas, guide_max_halalas,
              required_docs, delegation_platform, sort_order, active)
  on public.service_types to authenticated;

create policy "service_types: admin inserts"
  on public.service_types for insert to authenticated
  with check ((select public.is_admin()));
create policy "service_types: admin updates"
  on public.service_types for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ============================================================
-- إيقاف المستخدمين (عميل أو مزوّد) مع سبب
-- ============================================================
alter table public.profiles
  add column suspended_at timestamptz,
  add column suspension_reason text check (suspension_reason is null or char_length(suspension_reason) <= 500),
  add column suspended_by uuid references public.profiles (id) on delete set null;

create function public.set_user_suspension(
  p_profile_id uuid,
  p_suspend boolean,
  p_reason text,
  p_admin_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_reason text := nullif(trim(p_reason), '');
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and role = 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  if v_profile.role = 'admin' then
    raise exception 'cannot_suspend_admin' using errcode = '42501';
  end if;
  if p_suspend and v_reason is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  update public.profiles
  set suspended_at = case when p_suspend then now() end,
      suspension_reason = case when p_suspend then left(v_reason, 500) end,
      suspended_by = case when p_suspend then p_admin_id end
  where id = p_profile_id;

  -- المزوّد الموقوف يختفي من التصفح ولا يستقبل طلبات
  if v_profile.role = 'provider' then
    update public.providers
    set verification_status = case when p_suspend then 'suspended'::public.provider_verification_status
                                   else 'approved'::public.provider_verification_status end,
        rejection_reason = case when p_suspend then left(v_reason, 500) end,
        reviewed_at = now(), reviewed_by = p_admin_id
    where profile_id = p_profile_id
      and verification_status in ('approved', 'suspended');
  end if;

  insert into public.admin_audit_log (entity, entity_key, action, old_value, new_value, reason, actor_id)
  values ('user', p_profile_id::text, case when p_suspend then 'suspend' else 'unsuspend' end,
          to_jsonb(v_profile.suspended_at is not null), to_jsonb(p_suspend), v_reason, p_admin_id);
end;
$$;

-- ============================================================
-- صرف المستحقات: provider_payable → provider_paid (يدوياً بمرجع تحويل بنكي)
-- ============================================================
create table public.provider_payouts (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete restrict,
  amount_halalas bigint not null check (amount_halalas > 0),
  bank_reference text not null check (char_length(bank_reference) between 3 and 100),
  note text check (note is null or char_length(note) <= 500),
  paid_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index provider_payouts_provider_idx on public.provider_payouts (provider_id, created_at desc);

create trigger provider_payouts_no_update_delete
  before update or delete on public.provider_payouts
  for each row execute function public.audit_block_mutation();

alter table public.ledger_entries
  add column payout_id uuid references public.provider_payouts (id) on delete restrict;

-- المستحق لكل طلب لم يُصرف بعد (رصيد provider_payable)
create function public.provider_payable_by_order(p_provider_id uuid)
returns table (order_id uuid, balance_halalas bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select l.order_id, (sum(l.debit_halalas) - sum(l.credit_halalas))::bigint
  from public.ledger_entries l
  join public.orders o on o.id = l.order_id
  where o.provider_id = p_provider_id and l.account = 'provider_payable'
  group by l.order_id
  having sum(l.debit_halalas) - sum(l.credit_halalas) <> 0;
$$;

-- الصرف: قيد لكل طلب (provider_payable → provider_paid) مرتبط بسجل الصرف عبر payout_id،
-- حتى يبقى الدفتر متوازناً لكل طلب ولكل قيد
create function public.record_provider_payout(
  p_provider_id uuid,
  p_expected_halalas bigint,
  p_bank_reference text,
  p_admin_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total bigint;
  v_payout_id uuid;
  v_row record;
  v_journal uuid;
  v_ref text := trim(coalesce(p_bank_reference, ''));
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and role = 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(v_ref) < 3 then
    raise exception 'bank_reference_required' using errcode = '22023';
  end if;

  perform 1 from public.providers where id = p_provider_id for update;
  if not found then
    raise exception 'provider_not_found' using errcode = 'P0002';
  end if;

  select coalesce(sum(balance_halalas), 0) into v_total
  from public.provider_payable_by_order(p_provider_id);
  if v_total <= 0 then
    raise exception 'nothing_to_pay' using errcode = '55000';
  end if;
  if v_total <> p_expected_halalas then
    raise exception 'amount_changed' using errcode = '55000',
      detail = format('expected %s, current %s', p_expected_halalas, v_total);
  end if;

  insert into public.provider_payouts (provider_id, amount_halalas, bank_reference, note, paid_by)
  values (p_provider_id, v_total, v_ref, nullif(trim(p_note), ''), p_admin_id)
  returning id into v_payout_id;

  for v_row in select * from public.provider_payable_by_order(p_provider_id) where balance_halalas > 0 loop
    v_journal := gen_random_uuid();
    insert into public.ledger_entries
      (journal_id, order_id, payout_id, account, debit_halalas, credit_halalas, description)
    values
      (v_journal, v_row.order_id, v_payout_id, 'provider_payable', 0, v_row.balance_halalas,
       'صرف للمزوّد — مرجع التحويل ' || v_ref),
      (v_journal, v_row.order_id, v_payout_id, 'provider_paid', v_row.balance_halalas, 0,
       'صرف للمزوّد — مرجع التحويل ' || v_ref);
  end loop;

  insert into public.admin_audit_log (entity, entity_key, action, new_value, actor_id)
  values ('payout', p_provider_id::text, 'record',
          jsonb_build_object('payout_id', v_payout_id, 'amount_halalas', v_total, 'bank_reference', v_ref),
          p_admin_id);
  return v_payout_id;
end;
$$;

-- قائمة المستحقات لكل مزوّد
create function public.provider_payables()
returns table (
  provider_id uuid,
  office_name text,
  cr_number text,
  outstanding_halalas bigint,
  orders_count integer,
  paid_out_halalas bigint,
  last_payout_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() and auth.uid() is not null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select
    p.id, p.office_name, p.cr_number,
    coalesce((select sum(l.debit_halalas) - sum(l.credit_halalas)
              from public.ledger_entries l join public.orders o on o.id = l.order_id
              where o.provider_id = p.id and l.account = 'provider_payable'), 0)::bigint,
    (select count(*)::integer from public.provider_payable_by_order(p.id)),
    coalesce((select sum(l.debit_halalas) - sum(l.credit_halalas)
              from public.ledger_entries l join public.orders o on o.id = l.order_id
              where o.provider_id = p.id and l.account = 'provider_paid'), 0)::bigint,
    (select max(created_at) from public.provider_payouts po where po.provider_id = p.id)
  from public.providers p
  where exists (
    select 1 from public.ledger_entries l join public.orders o on o.id = l.order_id
    where o.provider_id = p.id and l.account in ('provider_payable', 'provider_paid')
  )
  order by 4 desc, p.office_name;
end;
$$;

-- ============================================================
-- أرصدة الدفتر ومؤشرات اللوحة (كل رقم مالي يُحسب من القيود مباشرة)
-- ============================================================
create function public.ledger_account_balances()
returns table (account public.ledger_account, debit_halalas bigint, credit_halalas bigint, balance_halalas bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() and auth.uid() is not null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select a.account,
         coalesce(sum(l.debit_halalas), 0)::bigint,
         coalesce(sum(l.credit_halalas), 0)::bigint,
         coalesce(sum(l.debit_halalas) - sum(l.credit_halalas), 0)::bigint
  from unnest(enum_range(null::public.ledger_account)) as a(account)
  left join public.ledger_entries l on l.account = a.account
  group by a.account
  order by a.account;
end;
$$;

create function public.admin_kpis()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_balances jsonb;
  v_repeat_base integer;
  v_repeat integer;
begin
  if not public.is_admin() and auth.uid() is not null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_object_agg(account, balance_halalas) into v_balances
  from public.ledger_account_balances();

  -- معدل التكرار: من المنشآت التي نشرت طلباً خلال 60 يوماً، كم نسبة من نشرت طلبين أو أكثر
  select count(*), count(*) filter (where n >= 2) into v_repeat_base, v_repeat
  from (
    select r.requester_account_id, count(*) as n
    from public.service_requests r
    join public.requester_accounts a on a.id = r.requester_account_id and a.account_type = 'establishment'
    where r.published_at >= now() - interval '60 days'
    group by r.requester_account_id
  ) t;

  return jsonb_build_object(
    'requests_published', (select count(*) from public.service_requests where published_at is not null),
    'requests_completed', (select count(*) from public.service_requests where status = 'completed'),
    'requests_disputed', (select count(*) from public.disputes),
    'disputes_open', (select count(*) from public.service_requests where status = 'disputed'),
    -- من الدفتر مباشرة (مدين − دائن لكل حساب)
    'revenue_halalas', coalesce((v_balances ->> 'platform_revenue')::bigint, 0),
    'escrow_halalas', coalesce((v_balances ->> 'escrow')::bigint, 0),
    'payables_halalas', coalesce((v_balances ->> 'provider_payable')::bigint, 0),
    'paid_out_halalas', coalesce((v_balances ->> 'provider_paid')::bigint, 0),
    -- تفصيل الإيراد من قيود إيراد المنصة نفسها: رسم الخدمة المثبّت في الطلب، والباقي عمولة
    'revenue_client_fee_halalas', coalesce((
      select sum(least(o.client_fee_halalas, rev.amount))
      from (select l.order_id, sum(l.debit_halalas) - sum(l.credit_halalas) as amount
            from public.ledger_entries l where l.account = 'platform_revenue' group by l.order_id) rev
      join public.orders o on o.id = rev.order_id
    ), 0)::bigint,
    'repeat_establishments', v_repeat,
    'active_establishments', v_repeat_base,
    'repeat_rate_pct', case when v_repeat_base = 0 then null
                            else round(100.0 * v_repeat / v_repeat_base)::integer end
  );
end;
$$;

-- ============================================================
-- صلاحيات و RLS
-- ============================================================
revoke all on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;
alter table public.admin_audit_log enable row level security;
create policy "admin_audit_log: admin"
  on public.admin_audit_log for select to authenticated using ((select public.is_admin()));

revoke all on public.provider_payouts from anon, authenticated;
grant select on public.provider_payouts to authenticated;
alter table public.provider_payouts enable row level security;
create policy "provider_payouts: admin or own provider"
  on public.provider_payouts for select to authenticated
  using ((select public.is_admin()) or provider_id = (select public.current_provider_id()));

revoke all on function public.set_user_suspension from public, anon, authenticated;
revoke all on function public.record_provider_payout from public, anon, authenticated;
revoke all on function public.provider_payable_by_order from public, anon, authenticated;
revoke all on function public.provider_payables from public, anon;
grant execute on function public.provider_payables to authenticated;
revoke all on function public.ledger_account_balances from public, anon;
grant execute on function public.ledger_account_balances to authenticated;
revoke all on function public.admin_kpis from public, anon;
grant execute on function public.admin_kpis to authenticated;
