-- حسابات التجربة (seed) مؤكَّدة التواصل دون رابط بريد، على أي قاعدة توجد فيها (ومنها الإنتاج قبل التنظيف).
-- تُطابَق بالمعرّفات الثابتة لحسابات seed فقط؛ لا يمس أي حساب حقيقي.
update auth.users
set email_verified_at = coalesce(email_verified_at, now())
where email in (
  'admin@mueqeb.test',
  'provider1@mueqeb.test',
  'provider3@mueqeb.test',
  'provider4@mueqeb.test',
  'establishment@mueqeb.test'
);

update auth.users
set phone_verified_at = coalesce(phone_verified_at, now())
where phone in ('+966500000002', '+966500000003');
