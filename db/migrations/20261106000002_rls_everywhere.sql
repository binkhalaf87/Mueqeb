-- معيار المرحلة 8: لا جدول بلا Row Level Security، حتى جداول المنصة الداخلية.
-- هذه الجداول لا يقرؤها إلا الخادم (service_role يتجاوز RLS، ومالك القاعدة كذلك)،
-- فتفعيل RLS بلا سياسات للمستخدمين يغلقها حتى لو مُنحت صلاحية عليها خطأً مستقبلاً.
alter table auth.users enable row level security;
alter table cron.job enable row level security;
