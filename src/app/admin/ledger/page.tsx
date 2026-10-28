import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatHalalas } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { ledgerImbalance } from "@/lib/payments/amounts";
import { Badge, Card, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "دفتر الحسابات" };

const ACCOUNT_LABEL: Record<string, string> = {
  client: "العميل",
  escrow: "الضمان (محفوظ)",
  platform_revenue: "إيراد المنصة",
  provider_payable: "مستحق للمزوّد",
  provider_paid: "مصروف للمزوّد",
};

export default async function LedgerPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const { data: entries } = await supabase
    .from("ledger_entries")
    .select(
      "id, journal_id, order_id, account, debit_halalas, credit_halalas, description, reverses_journal_id, created_at",
    )
    .order("id", { ascending: false })
    .limit(500);
  const rows = entries ?? [];

  // أرصدة الحسابات (مدين − دائن) على مستوى المنصة
  const balances = new Map<string, number>();
  for (const e of rows) {
    balances.set(
      e.account,
      (balances.get(e.account) ?? 0) + Number(e.debit_halalas) - Number(e.credit_halalas),
    );
  }

  // تجميع حسب الطلب للتحقق من التوازن
  const byOrder = new Map<string, typeof rows>();
  for (const e of rows) byOrder.set(e.order_id, [...(byOrder.get(e.order_id) ?? []), e]);
  const imbalance = ledgerImbalance(rows);

  return (
    <div className="space-y-6">
      <PageTitle subtitle="قيود مزدوجة append-only بالهللة. لا تعديل ولا حذف؛ التصحيح بقيد عكسي.">
        دفتر الحسابات
      </PageTitle>

      <div className="grid gap-4 sm:grid-cols-3" data-testid="ledger-summary">
        <Card className="p-4">
          <p className="text-sm text-muted">التوازن الكلي (مدين − دائن)</p>
          <p className="text-2xl font-bold" data-testid="ledger-imbalance">
            {imbalance === 0 ? "متوازن ✓" : formatHalalas(imbalance)}
          </p>
        </Card>
        {[...balances.entries()].map(([account, balance]) => (
          <Card key={account} className="p-4">
            <p className="text-sm text-muted">{ACCOUNT_LABEL[account] ?? account}</p>
            <p className="text-xl font-semibold">{formatHalalas(balance)}</p>
          </Card>
        ))}
      </div>

      {byOrder.size === 0 ? (
        <Card>
          <p className="text-sm text-muted">لا توجد قيود بعد.</p>
        </Card>
      ) : (
        [...byOrder.entries()].map(([orderId, lines]) => {
          const diff = ledgerImbalance(lines);
          return (
            <Card key={orderId} className="p-0" data-testid="ledger-order">
              <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
                <span className="font-mono text-xs text-muted" dir="ltr">
                  order {orderId.slice(0, 8)}
                </span>
                {diff === 0 ? (
                  <Badge tone="success">متوازن</Badge>
                ) : (
                  <Badge tone="danger">غير متوازن {formatHalalas(diff)}</Badge>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-background text-muted">
                    <tr>
                      <th className="px-4 py-2 text-start font-medium">#</th>
                      <th className="px-4 py-2 text-start font-medium">الوقت</th>
                      <th className="px-4 py-2 text-start font-medium">الحساب</th>
                      <th className="px-4 py-2 text-start font-medium">مدين</th>
                      <th className="px-4 py-2 text-start font-medium">دائن</th>
                      <th className="px-4 py-2 text-start font-medium">الوصف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[...lines].reverse().map((e) => (
                      <tr key={e.id}>
                        <td className="px-4 py-2 text-muted">{e.id}</td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          {formatDateTime(e.created_at)}
                        </td>
                        <td className="px-4 py-2">{ACCOUNT_LABEL[e.account]}</td>
                        <td className="px-4 py-2">
                          {Number(e.debit_halalas) > 0
                            ? formatHalalas(Number(e.debit_halalas))
                            : ""}
                        </td>
                        <td className="px-4 py-2">
                          {Number(e.credit_halalas) > 0
                            ? formatHalalas(Number(e.credit_halalas))
                            : ""}
                        </td>
                        <td className="px-4 py-2">
                          {e.description}
                          {e.reverses_journal_id && <Badge className="ms-2">عكسي</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
