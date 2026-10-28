import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { DELEGATION_LABEL } from "@/lib/providers/constants";
import { SETTINGS_FIELDS } from "@/lib/admin/settings";
import { Card, PageTitle } from "@/components/ui";
import { BlockedTermsForm, GuideForm, SettingsForm } from "./forms";

export const metadata: Metadata = { title: "الإعدادات" };

const ENTITY_LABEL: Record<string, string> = {
  setting: "إعداد",
  delegation_guide: "إرشادات تفويض",
  service_type: "نوع خدمة",
  user: "مستخدم",
  provider: "مزوّد",
  payout: "صرف",
};

function short(value: unknown) {
  if (value === null || value === undefined) return "—";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

export default async function SettingsPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const [{ data: settings }, { data: guides }, { data: audit }] = await Promise.all([
    supabase.from("settings").select("key, value"),
    supabase.from("delegation_guides").select("platform, title, steps").order("platform"),
    supabase
      .from("admin_audit_log")
      .select(
        "id, entity, entity_key, action, old_value, new_value, reason, created_at, profiles(full_name)",
      )
      .order("id", { ascending: false })
      .limit(100),
  ]);
  const value = (key: string) => settings?.find((s) => s.key === key)?.value;

  return (
    <div className="space-y-6">
      <PageTitle subtitle="كل تغيير يُسجَّل: من غيّره، ومتى، والقيمة القديمة والجديدة.">
        الإعدادات
      </PageTitle>

      <Card className="space-y-3">
        <h2 className="font-semibold">النسب والمهل والحدود</h2>
        <p className="text-sm text-muted">
          النسب الجديدة تُطبَّق على الطلبات التي تُرسى بعد التغيير؛ الطلبات القائمة تحتفظ بنسبها.
        </p>
        <SettingsForm
          fields={SETTINGS_FIELDS.map((f) => ({ ...f, value: String(value(f.key) ?? "") }))}
        />
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">الكلمات المحجوبة في المحادثة</h2>
        <p className="text-sm text-muted">
          أي رسالة تحتوي إحداها تُرفض وتُسجَّل في البلاغات. كلمة أو عبارة في كل سطر.
        </p>
        <BlockedTermsForm initial={((value("chat_blocked_terms") as string[]) ?? []).join("\n")} />
      </Card>

      {(guides ?? []).map((g) => (
        <Card key={g.platform} className="space-y-3" data-testid={`guide-${g.platform}`}>
          <h2 className="font-semibold">
            نصوص التفويض: {g.platform === "none" ? "بدون منصة" : DELEGATION_LABEL[g.platform]}
          </h2>
          <GuideForm platform={g.platform} title={g.title} steps={g.steps.join("\n")} />
        </Card>
      ))}

      <Card className="p-0">
        <h2 className="border-b border-border px-6 py-3 font-semibold">سجل التغييرات</h2>
        {!audit?.length ? (
          <p className="p-6 text-sm text-muted">لا تغييرات بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm" data-testid="audit-log">
              <thead className="bg-background text-muted">
                <tr>
                  <th className="px-4 py-2 text-start font-medium">الوقت</th>
                  <th className="px-4 py-2 text-start font-medium">بواسطة</th>
                  <th className="px-4 py-2 text-start font-medium">العنصر</th>
                  <th className="px-4 py-2 text-start font-medium">القديم</th>
                  <th className="px-4 py-2 text-start font-medium">الجديد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {audit.map((a) => (
                  <tr key={a.id} className="align-top">
                    <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(a.created_at)}</td>
                    <td className="px-4 py-2">{a.profiles?.full_name ?? "النظام"}</td>
                    <td className="px-4 py-2">
                      {ENTITY_LABEL[a.entity] ?? a.entity}:{" "}
                      <span className="font-mono text-xs" dir="ltr">
                        {a.entity_key.length > 24 ? a.entity_key.slice(0, 8) : a.entity_key}
                      </span>{" "}
                      ({a.action}){a.reason && ` — ${a.reason}`}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs break-all text-muted" dir="ltr">
                      {short(a.old_value)}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs break-all" dir="ltr">
                      {short(a.new_value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
