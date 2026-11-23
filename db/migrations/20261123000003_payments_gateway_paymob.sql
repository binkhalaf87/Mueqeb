-- إصلاح: محاولات الدفع عبر Paymob كانت تُرفض لأن قيد البوابة لا يسمح إلا بـ moyasar وmock.
alter table public.payments drop constraint payments_gateway_check;
alter table public.payments
  add constraint payments_gateway_check check (gateway in ('moyasar', 'paymob', 'mock'));
