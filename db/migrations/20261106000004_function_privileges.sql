-- مراجعة أمنية: تضييق تنفيذ الدوال على الحد الأدنى
-- دوال الـ triggers لا تُستدعى مباشرة (ولا تحتاج صلاحية EXECUTE لتعمل كـ trigger)
revoke all on function public.audit_delegation_guides from public, anon, authenticated;
revoke all on function public.audit_provider_status from public, anon, authenticated;
revoke all on function public.audit_service_types from public, anon, authenticated;
revoke all on function public.audit_settings from public, anon, authenticated;

-- مساعدات سياسات تخص المستخدم المسجّل فقط؛ الزائر لا يحتاجها
revoke all on function public.provider_is_editable from public, anon;
grant execute on function public.provider_is_editable to authenticated;
revoke all on function public.blocked_term_in from public, anon;
grant execute on function public.blocked_term_in to authenticated;
