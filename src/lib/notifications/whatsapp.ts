import type { DeliveryResult, NotificationChannel } from "./types";

/**
 * مكان جاهز لواتساب (WhatsApp Business Cloud API مثلاً): غير مفعّل بعد، فيُعلَّم كل إرسال skipped.
 * للتفعيل لاحقاً: نفّذ send بقوالب رسائل معتمدة، وأضف صف whatsapp في notify() بقاعدة البيانات.
 */
export class DisabledWhatsAppChannel implements NotificationChannel {
  readonly name = "whatsapp" as const;

  async send(): Promise<DeliveryResult> {
    return { status: "skipped", reason: "whatsapp_not_configured" };
  }
}
