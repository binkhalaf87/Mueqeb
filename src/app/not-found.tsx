import Link from "next/link";
import { Card } from "@/components/ui";

export default function NotFound() {
  return (
    <Card className="mx-auto max-w-md space-y-3 text-center">
      <h1 className="text-xl font-bold">الصفحة غير موجودة</h1>
      <p className="text-muted">ربما نُقلت الصفحة أو لم تعد متاحة.</p>
      <Link href="/" className="inline-block text-primary hover:underline">
        العودة للرئيسية
      </Link>
    </Card>
  );
}
