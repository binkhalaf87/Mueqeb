-- صياغة النصوص التي يراها العميل والمكتب: «اختيار العرض» و«المكتب» بدل «الترسية» و«المزوّد».
-- الإشعارات والأحداث السابقة تبقى كما هي (سجلات لا تُعدَّل).

-- إشعار المكتب عند اختيار عرضه (نسخة مطابقة لآخر تعريف مع تغيير النص فقط)
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
  select name_ar into v_service from public.service_types where id = v_request.service_type_id;
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

-- ملاحظة قرار النزاع في سجل الطلب يراها العميل (نسخة مطابقة مع تغيير النص فقط)
create or replace function public.resolve_dispute(
  p_request_id uuid,
  p_decision public.dispute_decision,
  p_refund_halalas integer,
  p_refund_ref text,
  p_admin_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_refund integer;
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and role = 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if (select status from public.service_requests where id = p_request_id) <> 'disputed' then
    raise exception 'invalid_status' using errcode = '55000';
  end if;
  select * into v_order from public.orders where request_id = p_request_id;

  v_refund := case p_decision
    when 'provider' then 0
    when 'full_refund' then v_order.total_paid_halalas
    else p_refund_halalas
  end;
  if p_decision = 'partial_refund' and (v_refund is null or v_refund <= 0 or v_refund > v_order.fee_halalas) then
    raise exception 'invalid_refund_amount' using errcode = '22023';
  end if;

  perform public.settle_order_ledger(
    v_order.id, v_refund, p_refund_ref,
    case p_decision when 'provider' then 'dispute_provider'
                    when 'full_refund' then 'dispute_full_refund'
                    else 'dispute_partial_refund' end
  );

  update public.disputes
  set decision = p_decision, refund_halalas = v_refund, decision_note = nullif(trim(p_note), ''),
      resolved_by = p_admin_id, resolved_at = now()
  where request_id = p_request_id;

  perform public.transition_request_as(p_request_id, 'resolved', 'admin', p_admin_id,
    case p_decision when 'provider' then 'قرار النزاع: لصالح المكتب'
                    when 'full_refund' then 'قرار النزاع: استرداد كامل'
                    else format('قرار النزاع: استرداد جزئي %s', public.format_sar(v_refund)) end);
end;
$$;

-- إرشاد التفويض في قوى (فقط إن لم تعدّله الإدارة)
update public.delegation_guides
set steps[3] = 'أضف المكتب بهويته أو رقم سجله التجاري الظاهر لك بعد اختيار العرض، وامنحه صلاحية الخدمة المطلوبة فقط.'
where platform = 'qiwa'
  and steps[3] = 'أضف المكتب بهويته أو رقم سجله التجاري الظاهر لك بعد الترسية، وامنحه صلاحية الخدمة المطلوبة فقط.';
