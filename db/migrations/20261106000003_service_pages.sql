-- صفحات الخدمات العامة: ملخص لكل نوع خدمة من أسعار المكاتب المعتمدة المعلنة (للزوار أيضاً)
create function public.public_service_overview(p_service_type_id uuid)
returns table (
  providers_count integer,
  from_fee_halalas integer,
  typical_duration_days integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct s.provider_id)::integer,
         min(s.fee_halalas)::integer,
         (percentile_cont(0.5) within group (order by s.duration_days))::integer
  from public.provider_services s
  join public.providers p on p.id = s.provider_id
  join public.service_types t on t.id = s.service_type_id
  where s.service_type_id = p_service_type_id
    and s.active and t.active
    and p.verification_status = 'approved';
$$;

revoke all on function public.public_service_overview from public;
grant execute on function public.public_service_overview to anon, authenticated;
