import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { ROLE_LABEL } from "@/lib/auth/routes";
import { getDb } from "@/lib/db/server";
import type { Enums } from "@/lib/db/types";
import { Card, PageTitle } from "@/components/ui";
import { EmailForm, EstablishmentForm, PasswordForm, ProfileForm } from "./account-forms";

export const metadata: Metadata = { title: "حسابي" };

export default async function AccountPage() {
  const user = await requireUser();
  const db = await getDb();
  const [profile, login, account] = await Promise.all([
    db.one<{ full_name: string; city: string | null }>(
      "select full_name, city from public.profiles where id = $1",
      [user.id],
    ),
    db.one<{ email: string | null; phone: string | null }>("select * from public.my_login()"),
    user.role === "requester"
      ? db.maybeOne<{
          id: string;
          account_type: Enums<"requester_account_type">;
          establishment_name: string | null;
          cr_number: string | null;
          about: string | null;
          member_role: Enums<"establishment_member_role">;
        }>(
          `select a.id, a.account_type, a.establishment_name, a.cr_number, a.about, m.member_role
           from public.establishment_members m
           join public.requester_accounts a on a.id = m.account_id
           where m.user_id = $1 limit 1`,
          [user.id],
        )
      : null,
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageTitle subtitle="بياناتك الشخصية، وبيانات منشأتك، وبيانات الدخول.">حسابي</PageTitle>

      <Card className="space-y-4" data-testid="account-profile">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">البيانات الشخصية</h2>
          {user.role && (
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">
              {ROLE_LABEL[user.role]}
            </span>
          )}
        </div>
        <ProfileForm fullName={profile.full_name} city={profile.city ?? ""} />
      </Card>

      {account?.account_type === "establishment" && (
        <Card className="space-y-4" data-testid="account-establishment">
          <h2 className="font-semibold">المنشأة</h2>
          <p className="text-sm text-muted">
            السجل التجاري: <span dir="ltr">{account.cr_number}</span> (لا يُعدَّل)
          </p>
          {account.member_role === "owner" ? (
            <EstablishmentForm
              accountId={account.id}
              establishmentName={account.establishment_name ?? ""}
              about={account.about ?? ""}
            />
          ) : (
            <div className="space-y-1 text-sm">
              <p className="font-medium">{account.establishment_name}</p>
              {account.about && <p className="whitespace-pre-line">{account.about}</p>}
              <p className="text-muted">تعديل بيانات المنشأة متاح لمالك الحساب فقط.</p>
            </div>
          )}
        </Card>
      )}

      {user.role === "provider" && (
        <Card className="text-sm">
          اسم المكتب ونبذته ومدنه تُعدَّل من{" "}
          <Link href="/dashboard/provider/profile" className="text-primary hover:underline">
            ملف المكتب
          </Link>
          .
        </Card>
      )}

      <Card className="space-y-4" data-testid="account-login">
        <h2 className="font-semibold">بيانات الدخول</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">البريد الإلكتروني</dt>
            <dd dir="ltr" className="text-start" data-testid="login-email">
              {login.email ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">الجوال</dt>
            <dd dir="ltr" className="text-start">
              {login.phone ?? "—"}
            </dd>
          </div>
        </dl>
        <EmailForm email={login.email} />
      </Card>

      <Card className="space-y-4" data-testid="account-password">
        <h2 className="font-semibold">كلمة المرور</h2>
        <p className="text-sm text-muted">
          هذه كلمة مرور حسابك في مُعقّب فقط. لن نطلب منك أبداً كلمة مرور أو رمز تحقق لحساباتك
          الحكومية.
        </p>
        <PasswordForm />
      </Card>
    </div>
  );
}
