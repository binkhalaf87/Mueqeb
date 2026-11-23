-- نوع مستند جديد: مرفقات توضيحية يرفقها العميل مع طلبه العام (في معاملة مستقلة قبل استخدامه)
alter type public.request_document_kind add value if not exists 'request_attachment';
