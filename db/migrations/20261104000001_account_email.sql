-- بريد المستخدم الحالي فقط (auth.users غير مقروء للمستخدمين)
create function public.current_user_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select email from auth.users where id = auth.uid();
$$;

revoke all on function public.current_user_email from public, anon;
grant execute on function public.current_user_email to authenticated;
