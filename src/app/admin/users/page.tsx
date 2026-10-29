import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db/server";
import type { Enums } from "@/lib/db/types";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABEL, type Role } from "@/lib/auth/routes";
import { Badge, Card, PageTitle } from "@/components/ui";
import { SuspensionForm } from "./suspension-form";

export const metadata: Metadata = { title: "المستخدمون" };

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  await requireRole("admin");
  const { q, role } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 60) : "";
  const roleFilter = role === "requester" || role === "provider" || role === "admin" ? role : "";

  const db = await getDb();
  // نمط LIKE آمن: تُهرَّب المحارف الخاصة فيُبحث عن النص كما هو
  const pattern = query ? `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const users = await db.query<{
    id: string;
    role: Enums<"user_role"> | null;
    full_name: string;
    phone: string | null;
    city: string | null;
    created_at: string;
    suspended_at: string | null;
    suspension_reason: string | null;
    office_name: string | null;
    verification_status: Enums<"provider_verification_status"> | null;
  }>(
    `select p.id, p.role, p.full_name, p.phone, p.city, p.created_at, p.suspended_at,
            p.suspension_reason, pr.office_name, pr.verification_status
     from public.profiles p left join public.providers pr on pr.profile_id = p.id
     where ($1::public.user_role is null or p.role = $1)
       and ($2::text is null or p.full_name ilike $2 or p.phone ilike $2)
     order by p.created_at desc limit 100`,
    [roleFilter || null, pattern],
  );

  return (
    <div className="space-y-6">
      <PageTitle subtitle="إيقاف الحساب يمنع الدخول، ويُخفي المزوّد من التصفح، ويُسجَّل مع السبب.">
        المستخدمون
      </PageTitle>

      <form className="flex flex-wrap items-end gap-3" role="search">
        <div className="space-y-1">
          <label htmlFor="q" className="block text-sm font-medium">
            بحث بالاسم أو الجوال
          </label>
          <input
            id="q"
            name="q"
            defaultValue={query}
            className="rounded-lg border border-border bg-surface px-3 py-2"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="role" className="block text-sm font-medium">
            الدور
          </label>
          <select
            id="role"
            name="role"
            defaultValue={roleFilter}
            className="rounded-lg border border-border bg-surface px-3 py-2"
          >
            <option value="">الكل</option>
            <option value="requester">طالب خدمة</option>
            <option value="provider">مزوّد خدمة</option>
            <option value="admin">الإدارة</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 font-medium text-white hover:bg-primary-hover"
        >
          بحث
        </button>
      </form>

      <Card className="p-0">
        {!users.length ? (
          <p className="p-6 text-sm text-muted">لا نتائج.</p>
        ) : (
          <ul className="divide-y divide-border" data-testid="users-list">
            {users.map((u) => (
              <li key={u.id} className="space-y-2 px-6 py-4" data-testid="user-row">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">{u.full_name || "—"}</span>
                  {u.role && <Badge>{ROLE_LABEL[u.role as Role]}</Badge>}
                  {u.office_name && <span className="text-sm text-muted">{u.office_name}</span>}
                  {u.suspended_at && <Badge tone="danger">موقوف</Badge>}
                  <span className="text-sm text-muted" dir="ltr">
                    {u.phone ?? ""}
                  </span>
                  <span className="ms-auto text-xs text-muted">
                    انضم {formatDateTime(u.created_at)}
                  </span>
                </div>
                {u.suspended_at && (
                  <p className="text-sm">
                    <span className="text-muted">سبب الإيقاف: </span>
                    {u.suspension_reason} ({formatDateTime(u.suspended_at)})
                  </p>
                )}
                {u.role !== "admin" && (
                  <SuspensionForm
                    profileId={u.id}
                    suspended={Boolean(u.suspended_at)}
                    name={u.full_name}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
