import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { DELEGATION_LABEL } from "@/lib/providers/constants";
import { Card, PageTitle } from "@/components/ui";
import { BlockedTermsForm, GuideForm } from "./forms";

export const metadata: Metadata = { title: "المحتوى والرقابة" };

export default async function ModerationPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const [{ data: guides }, { data: terms }, { data: blocked }] = await Promise.all([
    supabase
      .from("delegation_guides")
      .select("platform, title, steps, updated_at")
      .order("platform"),
    supabase.from("settings").select("value").eq("key", "chat_blocked_terms").single(),
    supabase
      .from("blocked_messages")
      .select("id, request_id, sender_id, body, matched_term, created_at")
      .order("id", { ascending: false })
      .limit(100),
  ]);

  return (
    <div className="space-y-6">
      <PageTitle subtitle="إرشادات التفويض الرسمي، وكلمات الرقابة في المحادثة، وسجل الرسائل المرفوضة.">
        المحتوى والرقابة
      </PageTitle>

      <Card className="p-0">
        <h2 className="border-b border-border px-6 py-3 font-semibold">
          رسائل مرفوضة (طلب كلمة مرور أو رمز تحقق) — {blocked?.length ?? 0}
        </h2>
        {!blocked?.length ? (
          <p className="p-6 text-sm text-muted">لا توجد.</p>
        ) : (
          <ul className="divide-y divide-border text-sm" data-testid="blocked-messages">
            {blocked.map((b) => (
              <li key={b.id} className="space-y-1 px-6 py-3">
                <p className="text-muted">
                  {formatDateTime(b.created_at)} · الكلمة: «{b.matched_term}» · طلب{" "}
                  <span className="font-mono" dir="ltr">
                    {b.request_id.slice(0, 8)}
                  </span>
                </p>
                <p>{b.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">كلمات الرقابة في المحادثة</h2>
        <p className="text-sm text-muted">
          أي رسالة تحتوي إحدى هذه الكلمات تُرفض وتُسجّل أعلاه. كلمة أو عبارة في كل سطر.
        </p>
        <BlockedTermsForm initial={((terms?.value as string[]) ?? []).join("\n")} />
      </Card>

      {(guides ?? []).map((g) => (
        <Card key={g.platform} className="space-y-3" data-testid={`guide-${g.platform}`}>
          <h2 className="font-semibold">
            إرشادات التفويض: {g.platform === "none" ? "بدون منصة" : DELEGATION_LABEL[g.platform]}
          </h2>
          <GuideForm platform={g.platform} title={g.title} steps={g.steps.join("\n")} />
        </Card>
      ))}
    </div>
  );
}
