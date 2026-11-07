-- إلغاء الحد الأدنى للأتعاب: 0 = بلا حد أدنى (الافتراضي الآن لكل الخدمات).
-- يبقى الحقل لمن يريد تحديد حد أدنى لاحقاً من لوحة الإدارة، والأتعاب نفسها يجب أن تكون أكبر من صفر.
alter table public.service_types drop constraint service_types_min_fee_halalas_check;
alter table public.service_types
  add constraint service_types_min_fee_halalas_check check (min_fee_halalas >= 0);
alter table public.service_types alter column min_fee_halalas set default 0;

update public.service_types set min_fee_halalas = 0 where min_fee_halalas <> 0;

comment on column public.service_types.min_fee_halalas is
  'الحد الأدنى لأتعاب العرض أو السعر المعلن بالهللة؛ 0 = بلا حد أدنى';
