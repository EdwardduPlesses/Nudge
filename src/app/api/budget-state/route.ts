import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { fetchBudgetStateForUser } from "@/lib/budget/supabase-persistence";
import { getVerifiedCurrentUser } from "@/lib/auth/current-user";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

async function resolveBudgetUserId(): Promise<string | null> {
  const [hdrs, cks] = await Promise.all([headers(), cookies()]);
  const u = await getVerifiedCurrentUser(hdrs, cks);
  return u?.userId ?? null;
}

export async function GET(req: Request) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  const userId = await resolveBudgetUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const periodId = new URL(req.url).searchParams.get("periodId");
  const todayIso = new Date().toISOString().slice(0, 10);
  try {
    const state = await fetchBudgetStateForUser(userId, todayIso, periodId);
    return NextResponse.json({ state });
  } catch (err) {
    console.error("[Nudge] GET /api/budget-state failed", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
