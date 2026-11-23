-- معرّف جلسة الدفع لدى البوابة (intention في Paymob) للاستعلام الاحتياطي عن حالة الدفع
-- حين لا يصل إشعار البوابة. يُكتب من الخادم فقط (لا صلاحيات كتابة للمستخدمين على payments).
alter table public.payments add column gateway_intention_id text
  check (gateway_intention_id is null or char_length(gateway_intention_id) <= 200);
