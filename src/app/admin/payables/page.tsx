import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatHalalas } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { DOCUMENTS_BUCKET } from "@/lib/providers/constants";
import { Card, PageTitle } from "@/components/ui";
import { PayoutForm } from "./payout-form";

export const metadata: Metadata = { title: "المستحقات" };

export default async function PayablesPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const [{ data: payables }, { data: payouts }, { data: ibanDocs }] = await Promise.all([
    supabase.rpc("provider_payables"),
    supabase
      .from("provider_payouts")
      .select("id, amount_halalas, bank_reference, note, created_at, providers(office_name)")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("provider_documents")
      .select("provider_id, storage_path")
      .eq("doc_type", "iban_certificate"),
  ]);

  // روابط موقعة لشهادات الحساب البنكي (للتحويل)
  const paths = (ibanDocs ?? []).map((d) => d.storage_path);
  const { data: signed } = paths.length
    ? await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrls(paths, 300)
    : { data: [] };
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const ibanUrl = new Map(
    (ibanDocs ?? []).map((d) => [d.provider_id, urlByPath.get(d.storage_path)]),
  );
  const total = (payables ?? []).reduce((s, p) => s + Number(p.outstanding_halalas), 0);

  return (
    <div className="space-y-6">
      <PageTitle subtitle="رصيد provider_payable لكل مزوّد من الدفتر. الصرف يدوي بتحويل بنكي ثم يُسجَّل هنا.">
        المستحقات
      </PageTitle>

      <div className="flex flex-wrap items-center gap-3">
        <p>
          إجمالي غير المصروف: <strong data-testid="payables-total">{formatHalalas(total)}</strong>
        </p>
        <a
          href="/admin/payables/export?type=payables"
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-primary"
          data-testid="export-payables"
        >
          تصدير المستحقات CSV
        </a>
        <a
          href="/admin/payables/export?type=payouts"
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-primary"
        >
          تصدير سجل الصرف CSV
        </a>
      </div>

      <Card className="p-0">
        {!payables?.length ? (
          <p className="p-6 text-sm text-muted">لا توجد مستحقات.</p>
        ) : (
          <ul className="divide-y divide-border" data-testid="payables-list">
            {payables.map((p) => (
              <li key={p.provider_id} className="space-y-3 px-6 py-4" data-testid="payable-row">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-semibold">{p.office_name}</span>
                  <span className="text-sm text-muted" dir="ltr">
                    CR {p.cr_number}
                  </span>
                  {ibanUrl.get(p.provider_id) && (
                    <a
                      href={ibanUrl.get(p.provider_id)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      شهادة الحساب البنكي (IBAN)
                    </a>
                  )}
                  <span className="ms-auto text-sm text-muted">
                    مصروف سابقاً {formatHalalas(Number(p.paid_out_halalas))}
                    {p.last_payout_at && ` · آخر صرف ${formatDateTime(p.last_payout_at)}`}
                  </span>
                </div>
                <p>
                  غير مصروف:{" "}
                  <strong data-testid="payable-outstanding">
                    {formatHalalas(Number(p.outstanding_halalas))}
                  </strong>{" "}
                  <span className="text-sm text-muted">({p.orders_count} طلب)</span>
                </p>
                {Number(p.outstanding_halalas) > 0 && (
                  <PayoutForm
                    providerId={p.provider_id}
                    expected={Number(p.outstanding_halalas)}
                    amountLabel={formatHalalas(Number(p.outstanding_halalas))}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-0">
        <h2 className="border-b border-border px-6 py-3 font-semibold">سجل الصرف</h2>
        {!payouts?.length ? (
          <p className="p-6 text-sm text-muted">لا توجد عمليات صرف.</p>
        ) : (
          <ul className="divide-y divide-border text-sm" data-testid="payouts-list">
            {payouts.map((po) => (
              <li key={po.id} className="flex flex-wrap gap-x-4 px-6 py-3">
                <span className="font-medium">{po.providers?.office_name}</span>
                <span>{formatHalalas(Number(po.amount_halalas))}</span>
                <span className="text-muted" dir="ltr">
                  {po.bank_reference}
                </span>
                <span className="ms-auto text-muted">{formatDateTime(po.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
