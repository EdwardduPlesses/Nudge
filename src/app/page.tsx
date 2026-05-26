import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [hdrs, cks] = await Promise.all([headers(), cookies()]);
  const user = await getCurrentUser(hdrs, cks);
  if (user) {
    redirect("/app");
  }
  redirect("/login");
}
