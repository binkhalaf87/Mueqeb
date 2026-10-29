import type { DeliveryResult, NotificationChannel, OutgoingNotification } from "./types";

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** نص البريد: عنوان الإشعار ونصه ورابط الإجراء، بلا أي بيانات حساسة إضافية */
export function renderEmail(n: OutgoingNotification) {
  const greeting = n.recipient.name ? `مرحباً ${n.recipient.name}،` : "مرحباً،";
  const text = [greeting, "", n.body, n.url ? `\n${n.url}` : "", "", "— مُعقّب"].join("\n");
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.7">
<p>${escapeHtml(greeting)}</p>
<p>${escapeHtml(n.body)}</p>
${n.url ? `<p><a href="${escapeHtml(n.url)}">فتح في مُعقّب</a></p>` : ""}
<p style="color:#666;font-size:12px">لن نطلب منك أبداً كلمة مرور أو رمز تحقق لحساباتك الحكومية.</p>
</div>`;
  return { subject: `مُعقّب — ${n.title}`, text, html };
}

/** للتطوير والاختبار: لا يرسل شيئاً، ويسجّل نوع الإشعار فقط (لا عنوان ولا نص) */
export class LogEmailChannel implements NotificationChannel {
  readonly name = "email" as const;
  readonly sent: OutgoingNotification[] = [];

  async send(n: OutgoingNotification): Promise<DeliveryResult> {
    if (!n.recipient.email) return { status: "skipped", reason: "no_email" };
    this.sent.push(n);
    if (process.env.NODE_ENV !== "test") console.info(`[email:log] ${n.kind}`);
    return { status: "sent" };
  }
}

/** Resend (https://resend.com) عبر HTTP؛ يحتاج RESEND_API_KEY وEMAIL_FROM بنطاق موثّق */
export class ResendEmailChannel implements NotificationChannel {
  readonly name = "email" as const;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {
    if (!apiKey || !from)
      throw new Error("RESEND_API_KEY وEMAIL_FROM مطلوبان لـ EMAIL_PROVIDER=resend");
  }

  async send(n: OutgoingNotification): Promise<DeliveryResult> {
    if (!n.recipient.email) return { status: "skipped", reason: "no_email" };
    const { subject, text, html } = renderEmail(n);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [n.recipient.email], subject, text, html }),
    });
    if (!response.ok) {
      // لا نسجّل نص الاستجابة كاملاً (قد يحوي العنوان)؛ الحالة تكفي للتشخيص
      throw new Error(`resend_http_${response.status}`);
    }
    return { status: "sent" };
  }
}
