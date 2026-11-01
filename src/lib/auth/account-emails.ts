/**
 * رسائل الحساب المباشرة (استعادة كلمة المرور، تأكيد البريد): تُرسل فوراً عبر قناة البريد
 * ولا تمر بجدول الإشعارات، لأن الرابط يحمل رمزاً سرياً لا يُخزَّن ولا يظهر في المنصة.
 */
import { getNotificationProvider } from "@/lib/notifications";
import { logError } from "@/lib/log";
import { siteUrl } from "@/lib/site";
import { issueToken } from "./one-time-tokens";

type Recipient = { userId: string; email: string; name: string };

async function send(
  to: Recipient,
  kind: string,
  title: string,
  body: string,
  url: string,
): Promise<boolean> {
  try {
    const result = await getNotificationProvider()
      .channel("email")
      .send({ kind, title, body, url, recipient: { name: to.name, email: to.email, phone: null } });
    return result.status === "sent";
  } catch (error) {
    logError(`account-email:${kind}`, error);
    return false;
  }
}

export async function sendPasswordResetEmail(to: Recipient) {
  const token = await issueToken(to.userId, "password_reset", to.email);
  return send(
    to,
    "password_reset",
    "استعادة كلمة المرور",
    "طلبت تعيين كلمة مرور جديدة لحسابك في مُعقّب. الرابط صالح لساعة واحدة ولمرة واحدة. إن لم تطلب ذلك فتجاهل هذه الرسالة.",
    `${siteUrl()}/reset-password?token=${token}`,
  );
}

export async function sendVerificationEmail(to: Recipient) {
  const token = await issueToken(to.userId, "email_verify", to.email);
  return send(
    to,
    "email_verify",
    "تأكيد بريدك الإلكتروني",
    "أكّد بريدك لتفعيل حسابك في مُعقّب ونشر الطلبات وتقديم العروض. الرابط صالح لثلاثة أيام.",
    `${siteUrl()}/verify-email?token=${token}`,
  );
}
