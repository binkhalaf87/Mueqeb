import { LogEmailChannel, ResendEmailChannel } from "./email";
import { DisabledWhatsAppChannel } from "./whatsapp";
import type { ChannelName, NotificationChannel, NotificationProvider } from "./types";

class Channels implements NotificationProvider {
  constructor(private readonly channels: Record<ChannelName, NotificationChannel>) {}

  channel(name: ChannelName) {
    return this.channels[name];
  }
}

let cached: NotificationProvider | undefined;

/**
 * المزوّد المهيأ من البيئة:
 * EMAIL_PROVIDER=log (الافتراضي: لا إرسال فعلي) | resend (RESEND_API_KEY + EMAIL_FROM)
 */
export function getNotificationProvider(): NotificationProvider {
  if (cached) return cached;
  const email =
    process.env.EMAIL_PROVIDER === "resend"
      ? new ResendEmailChannel(process.env.RESEND_API_KEY ?? "", process.env.EMAIL_FROM ?? "")
      : new LogEmailChannel();
  cached = new Channels({ email, whatsapp: new DisabledWhatsAppChannel() });
  return cached;
}

/** للاختبارات: حقن مزوّد بديل */
export function setNotificationProvider(provider: NotificationProvider | undefined) {
  cached = provider;
}

export type { ChannelName, NotificationChannel, NotificationProvider } from "./types";
