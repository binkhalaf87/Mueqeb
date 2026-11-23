-- سجل التدقيق: مطابقة دفعة يدوياً من الإدارة (بعد استعلام البوابة) تُسجَّل ككيان payment
alter table public.admin_audit_log drop constraint admin_audit_log_entity_check;
alter table public.admin_audit_log add constraint admin_audit_log_entity_check
  check (entity in ('setting', 'delegation_guide', 'service_type', 'user', 'provider', 'payout', 'payment'));
