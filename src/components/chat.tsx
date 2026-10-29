"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { sendMessage, type SendMessageState } from "@/app/actions/execution";
import type { ChatMessage } from "@/lib/execution/queries";
import { Card } from "@/components/ui";

const ROLE_LABEL: Record<string, string> = {
  requester: "العميل",
  provider: "المكتب",
  admin: "الإدارة",
};

/** فترة الاستطلاع أثناء ظهور الصفحة */
const POLL_MS = 3000;

/**
 * محادثة خيط (طلب، مزوّد) مع تحديث شبه لحظي بالاستطلاع الدوري من /api/messages.
 * الإرسال عبر Server Action تمر بفلتر قاعدة البيانات (حجب/رفض)، والقراءة بهوية المستخدم
 * فيقصرها RLS على أطراف الخيط فلا تصل رسائل خيوط الآخرين.
 */
export function Chat({
  requestId,
  providerId,
  initialMessages,
  title,
  closed,
}: {
  requestId: string;
  providerId: string;
  initialMessages: ChatMessage[];
  title: string;
  closed?: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [state, action, pending] = useActionState<SendMessageState, FormData>(sendMessage, {});
  const formRef = useRef<HTMLFormElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const lastIdRef = useRef(initialMessages.at(-1)?.id ?? 0);

  const refresh = useCallback(async () => {
    const params = new URLSearchParams({
      request: requestId,
      provider: providerId,
      after: String(lastIdRef.current),
    });
    const response = await fetch(`/api/messages?${params}`, { cache: "no-store" });
    if (!response.ok) return;
    const incoming = (await response.json()) as ChatMessage[];
    if (!incoming.length) return;
    lastIdRef.current = Math.max(lastIdRef.current, ...incoming.map((m) => m.id));
    setMessages((current) => {
      const known = new Set(current.map((m) => m.id));
      const fresh = incoming.filter((m) => !known.has(m.id));
      return fresh.length ? [...current, ...fresh].sort((a, b) => a.id - b.id) : current;
    });
  }, [requestId, providerId]);

  // الاستطلاع الدوري ما دامت الصفحة ظاهرة والمحادثة مفتوحة
  useEffect(() => {
    if (closed) return;
    const tick = () => {
      if (document.visibilityState === "visible") refresh().catch(() => undefined);
    };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [closed, refresh]);

  // بعد الإرسال: مسح الحقل وجلب الرسالة فوراً
  useEffect(() => {
    if (state.status !== "sent" && state.status !== "masked") return;
    formRef.current?.reset();
    refresh().catch(() => undefined);
  }, [state, refresh]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  return (
    <Card className="space-y-3" data-testid="chat">
      <h2 className="font-semibold">{title}</h2>
      <ol
        ref={listRef}
        className="max-h-80 space-y-2 overflow-y-auto rounded-lg bg-background p-3"
        aria-live="polite"
        data-testid="chat-messages"
      >
        {messages.length === 0 && <li className="text-sm text-muted">لا توجد رسائل بعد.</li>}
        {messages.map((m) => {
          const mine = m.mine;
          return (
            <li key={m.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  mine ? "bg-primary text-white" : "border border-border bg-surface"
                }`}
              >
                {!mine && <p className="mb-0.5 text-xs opacity-70">{ROLE_LABEL[m.sender_role]}</p>}
                <p className="whitespace-pre-line">{m.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {closed ? (
        <p className="text-sm text-muted">أُغلقت المحادثة.</p>
      ) : (
        <form ref={formRef} action={action} className="space-y-2">
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="providerId" value={providerId} />
          <div className="flex gap-2">
            <label htmlFor={`chat-${providerId}`} className="sr-only">
              رسالتك
            </label>
            <input
              id={`chat-${providerId}`}
              name="body"
              autoComplete="off"
              maxLength={2000}
              placeholder="اكتب رسالتك…"
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-primary px-4 py-2 font-medium text-white hover:bg-primary-hover disabled:opacity-60"
            >
              إرسال
            </button>
          </div>
          {state.message && (
            <p
              role="alert"
              data-testid="chat-notice"
              className={`text-sm ${state.status === "blocked" || state.status === "error" ? "text-danger" : "text-muted"}`}
            >
              {state.message}
            </p>
          )}
          <p className="text-xs text-muted">
            لا تشارك أبداً كلمات مرور أو رموز تحقق لحساباتك الحكومية.
          </p>
        </form>
      )}
    </Card>
  );
}
