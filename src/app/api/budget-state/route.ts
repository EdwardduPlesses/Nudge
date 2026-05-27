import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { fetchBudgetStateForUser } from "@/lib/budget/supabase-persistence";
import { getCurrentUser } from "@/lib/auth/current-user";
import { userHasAnyNudgeMembership } from "@/lib/auth/standalone-gate";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

const GATE_REFRESH_SECONDS = 15 * 60;

async function resolveBudgetUserId(): Promise<string | null> {
  const [hdrs, cks] = await Promise.all([headers(), cookies()]);
  const u = await getCurrentUser(hdrs, cks);
  if (!u) return null;

  // For standalone sessions, re-check the gate if the cookie's gate timestamp is stale.
  // Iframe and dev-preview sources are already authoritative via Whop's own checks
  // (verifyUserToken / NUDGE_STRICT_WHOP=0 dev fallback).
  if (u.source === "standalone-session") {
    const stale = Math.floor(Date.now() / 1000) - u.gateCheckedAt > GATE_REFRESH_SECONDS;
    if (stale && !(await userHasAnyNudgeMembership(u.userId))) return null;
  }
  return u.userId;
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
