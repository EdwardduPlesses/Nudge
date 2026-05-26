import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { parseBudgetStateBody } from "@/lib/budget/parse-budget-state";
import { fetchBudgetStateFromSupabase, replaceBudgetStateInSupabase } from "@/lib/budget/supabase-persistence";
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
    if (stale) {
      const allowed = await userHasAnyNudgeMembership(u.userId);
      if (!allowed) return null;
    }
  }
  return u.userId;
}

export async function GET() {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  const userId = await resolveBudgetUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const state = await fetchBudgetStateFromSupabase(userId);
    return NextResponse.json({ state });
  } catch (err) {
    console.error("[Nudge] GET /api/budget-state failed", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  const userId = await resolveBudgetUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const state = parseBudgetStateBody(body);
  if (!state) {
    return NextResponse.json({ error: "Invalid budget payload" }, { status: 400 });
  }
  try {
    await replaceBudgetStateInSupabase(userId, state);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Nudge] PUT /api/budget-state failed", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
