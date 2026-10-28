import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** خلية CSV آمنة: اقتباس، وتعطيل الصيغ (=, +, -, @) لمنع حقن الصيغ في Excel */
function cell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const sar = (halalas: number | string) => (Number(halalas) / 100).toFixed(2);

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin" || user.suspended) {
    return new Response("Forbidden", { status: 403 });
  }
  const type = new URL(request.url).searchParams.get("type") === "payouts" ? "payouts" : "payables";
  const supabase = await createClient();
  let rows: unknown[][];

  if (type === "payables") {
    const { data } = await supabase.rpc("provider_payables");
    rows = [
      [
        "provider_id",
        "office_name",
        "cr_number",
        "outstanding_sar",
        "outstanding_halalas",
        "orders",
        "paid_out_sar",
        "last_payout_at",
      ],
      ...(data ?? []).map((p) => [
        p.provider_id,
        p.office_name,
        p.cr_number,
        sar(p.outstanding_halalas),
        p.outstanding_halalas,
        p.orders_count,
        sar(p.paid_out_halalas),
        p.last_payout_at ?? "",
      ]),
    ];
  } else {
    const { data } = await supabase
      .from("provider_payouts")
      .select(
        "id, provider_id, amount_halalas, bank_reference, note, created_at, providers(office_name)",
      )
      .order("created_at", { ascending: false });
    rows = [
      [
        "payout_id",
        "provider_id",
        "office_name",
        "amount_sar",
        "amount_halalas",
        "bank_reference",
        "note",
        "created_at",
      ],
      ...(data ?? []).map((po) => [
        po.id,
        po.provider_id,
        po.providers?.office_name ?? "",
        sar(po.amount_halalas),
        po.amount_halalas,
        po.bank_reference,
        po.note ?? "",
        po.created_at,
      ]),
    ];
  }

  // BOM لكي يعرض Excel العربية بشكل صحيح
  const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mueqeb-${type}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
