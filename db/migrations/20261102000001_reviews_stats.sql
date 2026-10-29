-- المرحلة 6: التقييم المتبادل (مخفي حتى يقيّم الطرفان أو تمر 7 أيام) وإحصاءات المزوّد والعميل

insert into public.settings (key, value, description) values
  ('review_reveal_days', '7', 'تظهر التقييمات بعد هذه المدة من الإكمال حتى لو لم يقيّم الطرف الآخر');

-- ============================================================
-- reviews: تقييم واحد لكل طرف لكل طلب. لا تعديل ولا حذف.
-- ============================================================
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  reviewer_role text not null check (reviewer_role in ('requester', 'provider')),
  reviewer_id uuid not null references public.profiles (id) on delete restrict,
  provider_id uuid not null references public.providers (id) on delete restrict,
  requester_account_id uuid not null references public.requester_accounts (id) on delete restrict,
  -- العميل يقيّم المزوّد
  speed smallint check (speed between 1 and 5),
  accuracy smallint check (accuracy between 1 and 5),
  communication smallint check (communication between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 1000),
  -- المزوّد يقيّم العميل
  request_clarity smallint check (request_clarity between 1 and 5),
  documents_speed smallint check (documents_speed between 1 and 5),
  created_at timestamptz not null default now(),
  unique (request_id, reviewer_role),
  constraint reviews_scores_by_role check (
    (reviewer_role = 'requester'
      and speed is not null and accuracy is not null and communication is not null
      and request_clarity is null and documents_speed is null)
    or (reviewer_role = 'provider'
      and request_clarity is not null and documents_speed is not null
      and speed is null and accuracy is null and communication is null and comment is null)
  ),
  constraint reviews_comment_clean check (
    not public.contains_contact_info(comment) and not public.mentions_credentials(comment)
  )
);

create index reviews_provider_idx on public.reviews (provider_id);
create index reviews_account_idx on public.reviews (requester_account_id);

-- منع التعديل والحذف حتى لمالك القاعدة (التقييم نهائي)
create function public.reviews_block_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'reviews_are_final' using errcode = '42501';
end;
$$;

create trigger reviews_no_update_delete
  before update or delete on public.reviews
  for each row execute function public.reviews_block_mutation();

-- ============================================================
-- القاعدة المزدوجة: يظهر تقييما الطلب معاً عندما يقيّم الطرفان، أو بعد مرور 7 أيام من الإكمال
-- ============================================================
create function public.reviews_revealed(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.reviews where request_id = p_request_id) = 2
    or exists (
      select 1 from public.service_requests r
      where r.id = p_request_id
        and r.closed_at <= now() - make_interval(days => coalesce(public.int_setting('review_reveal_days'), 7))
    );
$$;

-- ============================================================
-- submit_review: التقييم بعد completed فقط ولطلب مدفوع داخل المنصة
-- ============================================================
create function public.submit_review(
  p_request_id uuid,
  p_speed smallint default null,
  p_accuracy smallint default null,
  p_communication smallint default null,
  p_comment text default null,
  p_request_clarity smallint default null,
  p_documents_speed smallint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.service_requests;
  v_order public.orders;
  v_role text;
begin
  select * into v_request from public.service_requests where id = p_request_id;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  if public.is_request_member(p_request_id) then
    v_role := 'requester';
  elsif public.is_awarded_provider(p_request_id) then
    v_role := 'provider';
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_order from public.orders where request_id = p_request_id;
  if v_request.status <> 'completed'
     or v_order.id is null
     or v_order.payment_status <> 'paid'
     or v_order.settlement is distinct from 'completed' then
    raise exception 'not_reviewable' using errcode = '55000';
  end if;

  if exists (select 1 from public.reviews where request_id = p_request_id and reviewer_role = v_role) then
    raise exception 'already_reviewed' using errcode = '23505';
  end if;

  insert into public.reviews (
    request_id, reviewer_role, reviewer_id, provider_id, requester_account_id,
    speed, accuracy, communication, comment, request_clarity, documents_speed
  ) values (
    p_request_id, v_role, auth.uid(), v_order.provider_id, v_request.requester_account_id,
    case when v_role = 'requester' then p_speed end,
    case when v_role = 'requester' then p_accuracy end,
    case when v_role = 'requester' then p_communication end,
    case when v_role = 'requester' then nullif(trim(p_comment), '') end,
    case when v_role = 'provider' then p_request_clarity end,
    case when v_role = 'provider' then p_documents_speed end
  );
end;
$$;

-- ============================================================
-- إحصاءات المزوّد (تُحسب من البيانات مباشرة فهي محدّثة دائماً)
-- ============================================================
drop function public.provider_performance(uuid);

create function public.provider_stats(p_provider_ids uuid[])
returns table (
  provider_id uuid,
  completed_orders integer,
  reviews_count integer,
  avg_rating numeric,
  avg_speed numeric,
  avg_accuracy numeric,
  avg_communication numeric,
  on_time_pct integer,
  late_orders integer,
  avg_response_minutes integer,
  dispute_pct integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with ids as (select unnest(p_provider_ids) as provider_id),
  awarded as (
    select b.provider_id, r.id, r.status, r.is_late, r.started_at
    from public.service_requests r
    join public.bids b on b.id = r.awarded_bid_id
    where b.provider_id = any (p_provider_ids)
  ),
  revealed as (
    select rv.* from public.reviews rv
    where rv.provider_id = any (p_provider_ids)
      and rv.reviewer_role = 'requester'
      and public.reviews_revealed(rv.request_id)
  ),
  responses as (
    select b.provider_id,
           avg(extract(epoch from (b.created_at - r.published_at)) / 60) as minutes
    from public.bids b
    join public.service_requests r on r.id = b.request_id
    where b.provider_id = any (p_provider_ids)
      and r.mode = 'public' and b.status <> 'withdrawn' and r.published_at is not null
    group by b.provider_id
  )
  select
    ids.provider_id,
    (select count(*) from awarded a where a.provider_id = ids.provider_id and a.status in ('completed', 'resolved'))::integer,
    (select count(*) from revealed v where v.provider_id = ids.provider_id)::integer,
    (select round(avg((v.speed + v.accuracy + v.communication) / 3.0), 2) from revealed v where v.provider_id = ids.provider_id),
    (select round(avg(v.speed), 2) from revealed v where v.provider_id = ids.provider_id),
    (select round(avg(v.accuracy), 2) from revealed v where v.provider_id = ids.provider_id),
    (select round(avg(v.communication), 2) from revealed v where v.provider_id = ids.provider_id),
    (select case when count(*) = 0 then null
                 else round(100.0 * count(*) filter (where not a.is_late) / count(*))::integer end
     from awarded a
     where a.provider_id = ids.provider_id and a.status in ('delivered', 'completed', 'resolved')),
    (select count(*) from awarded a where a.provider_id = ids.provider_id and a.is_late)::integer,
    (select round(rs.minutes)::integer from responses rs where rs.provider_id = ids.provider_id),
    (select case when count(*) = 0 then null
                 else round(100.0 * count(d.request_id) / count(*))::integer end
     from awarded a
     left join public.disputes d on d.request_id = a.id
     where a.provider_id = ids.provider_id and a.started_at is not null)
  from ids;
$$;

-- التقييمات المنشورة لمزوّد (للصفحة العامة؛ بلا هوية العميل)
create function public.provider_reviews(p_provider_id uuid, p_limit integer default 20)
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
  select rv.id, rv.speed, rv.accuracy, rv.communication, rv.comment, rv.created_at, st.name_ar
  from public.reviews rv
  join public.service_requests r on r.id = rv.request_id
  join public.service_types st on st.id = r.service_type_id
  join public.providers p on p.id = rv.provider_id and p.verification_status = 'approved'
  where rv.provider_id = p_provider_id
    and rv.reviewer_role = 'requester'
    and public.reviews_revealed(rv.request_id)
  order by rv.created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

-- ============================================================
-- إحصاءات طالب الخدمة للمزوّد عند تقديم العرض (بلا هوية)
-- ============================================================
create function public.requester_stats_for_request(p_request_id uuid)
returns table (avg_rating numeric, reviews_count integer, completed_requests integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account uuid;
begin
  if not (public.provider_can_view_request(p_request_id) or public.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select requester_account_id into v_account from public.service_requests where id = p_request_id;

  return query
  select
    (select round(avg((rv.request_clarity + rv.documents_speed) / 2.0), 2)
     from public.reviews rv
     where rv.requester_account_id = v_account and rv.reviewer_role = 'provider'
       and public.reviews_revealed(rv.request_id)),
    (select count(*)::integer
     from public.reviews rv
     where rv.requester_account_id = v_account and rv.reviewer_role = 'provider'
       and public.reviews_revealed(rv.request_id)),
    (select count(*)::integer from public.service_requests r
     where r.requester_account_id = v_account and r.status = 'completed');
end;
$$;

-- ============================================================
-- request_bids: إضافة إحصاءات المزوّد لبطاقة المقارنة
-- ============================================================
drop function public.request_bids(uuid);

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
  rating numeric,
  reviews_count integer,
  on_time_pct integer,
  dispute_pct integer
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
  with b as (
    select b.*, p.office_name, r.published_at, r.created_at as request_created_at
    from public.bids b
    join public.service_requests r on r.id = b.request_id
    join public.providers p on p.id = b.provider_id
    where b.request_id = p_request_id and b.status <> 'withdrawn'
  ),
  s as (
    select * from public.provider_stats(array(select distinct b.provider_id from b))
  )
  select
    b.id, b.provider_id, b.office_name, b.fee_halalas, b.expected_gov_fees_halalas,
    b.duration_days, b.includes, b.needs_from_client, b.status, b.created_at,
    greatest(0, floor(extract(epoch from (b.created_at - coalesce(b.published_at, b.request_created_at))) / 60))::integer,
    s.completed_orders, s.avg_rating, s.reviews_count, s.on_time_pct, s.dispute_pct
  from b
  join s on s.provider_id = b.provider_id
  order by b.fee_halalas, b.created_at;
end;
$$;

-- ============================================================
-- صلاحيات و RLS
-- ============================================================
revoke all on function public.submit_review from public, anon;
grant execute on function public.submit_review to authenticated;
revoke all on function public.request_bids from public, anon;
grant execute on function public.request_bids to authenticated;
revoke all on function public.requester_stats_for_request from public, anon;
grant execute on function public.requester_stats_for_request to authenticated;
grant execute on function public.provider_stats to anon, authenticated;
grant execute on function public.provider_reviews to anon, authenticated;
grant execute on function public.reviews_revealed to anon, authenticated;

revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to authenticated;

alter table public.reviews enable row level security;

-- المقيِّم يرى تقييمه دائماً؛ الطرف الآخر يراه بعد الكشف فقط؛ الإدارة الكل
create policy "reviews: own, revealed to the other party, admin"
  on public.reviews for select to authenticated
  using (
    reviewer_id = (select auth.uid())
    or (select public.is_admin())
    or (
      public.reviews_revealed(request_id)
      and (
        (select public.is_request_member(request_id))
        or provider_id = (select public.current_provider_id())
      )
    )
  );
