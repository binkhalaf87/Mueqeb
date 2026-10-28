import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/routes";

export default async function DashboardIndex() {
  const user = await requireUser();
  redirect(homePathForRole(user.role));
}
