/**
 * قنوات الإشعار الخارجية خلف واجهة واحدة. الإشعار داخل المنصة يُنشأ دائماً في قاعدة البيانات؛
 * القنوات هنا ترسل نسخة منه (بريد الآن، واتساب لاحقاً) من صندوق الإرسال notification_outbox.
 */
export type ChannelName = "email" | "whatsapp";

export type OutgoingNotification = {
  kind: string;
  title: string;
  body: string;
  /** رابط مطلق داخل المنصة (APP_URL + المسار) */
  url: string | null;
  recipient: { name: string; email: string | null; phone: string | null };
};

/** sent: أُرسل؛ skipped: لا عنوان مناسب أو القناة غير مفعّلة (ليس خطأً) */
export type DeliveryResult = { status: "sent" } | { status: "skipped"; reason: string };

export interface NotificationChannel {
  readonly name: ChannelName;
  send(notification: OutgoingNotification): Promise<DeliveryResult>;
}

export interface NotificationProvider {
  channel(name: ChannelName): NotificationChannel;
}
