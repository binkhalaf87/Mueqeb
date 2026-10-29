-- الحساب واللوحات: نبذة المنشأة، تغيير بيانات الدخول، ملخص مستحقات المزوّد

-- ============================================================
-- نبذة المنشأة (يعدّلها المالك فقط عبر سياسة "requester_accounts: owner updates")
-- لا تُعرض للمزوّدين؛ ومع ذلك لا يجوز أن تطلب بيانات دخول حكومية
-- ============================================================
alter table public.requester_accounts
  add column about text check (
    about is null
    or (char_length(about) <= 1000 and not public.mentions_credentials(about))
  );

grant update (about) on public.requester_accounts to authenticated;

-- ============================================================
-- إصدار الجلسات: كل جلسة تحمل رقم الإصدار وقت إنشائها، وتغيير كلمة المرور يزيده
-- فتبطل كل الجلسات السابقة فوراً (دون الاعتماد على تزامن الساعات)
-- ============================================================
alter table auth.users add column session_version integer not null default 0;

-- بيانات الدخول للمستخدم الحالي فقط (auth.users غير مقروء للمستخدمين)
create function public.my_login()
returns table (email text, phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.email, u.phone from auth.users u where u.id = auth.uid();
$$;

revoke all on function public.my_login from public, anon;
grant execute on function public.my_login to authenticated;

-- ============================================================
-- مستحقات المزوّد الحالي من الدفتر مباشرة
--   payable: رصيد provider_payable غير المصروف
--   paid_out: ما صُرف فعلاً (provider_paid)
--   in_escrow: صافي أتعاب طلبات مدفوعة لم تُسوَّ بعد (محجوز حتى تأكيد الإنجاز)
-- ============================================================
create function public.my_provider_earnings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select public.current_provider_id() as id)
  select jsonb_build_object(
    'payable_halalas', coalesce((
      select sum(l.debit_halalas) - sum(l.credit_halalas)
      from public.ledger_entries l join public.orders o on o.id = l.order_id
      where o.provider_id = (select id from me) and l.account = 'provider_payable'
    ), 0)::bigint,
    'paid_out_halalas', coalesce((
      select sum(l.debit_halalas) - sum(l.credit_halalas)
      from public.ledger_entries l join public.orders o on o.id = l.order_id
      where o.provider_id = (select id from me) and l.account = 'provider_paid'
    ), 0)::bigint,
    'in_escrow_halalas', coalesce((
      select sum(o.provider_net_halalas)
      from public.orders o
      where o.provider_id = (select id from me)
        and o.payment_status = 'paid' and o.settled_at is null
    ), 0)::bigint
  )
  where (select id from me) is not null;
$$;

revoke all on function public.my_provider_earnings from public, anon;
grant execute on function public.my_provider_earnings to authenticated;
