import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { parseBudgetStateBody } from "@/lib/budget/parse-budget-state";
import { fetchBudgetStateFromSupabase, replaceBudgetStateInSupabase } from "@/lib/budget/supabase-persistence";
import { resolveNudgeUserIdForBudgetApi } from "@/lib/nudge-dev-preview";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { whopsdk } from "@/lib/whop-sdk";

export const dynamic = "force-dynamic";

async function resolveBudgetUserId(): Promise<string | null> {
  const hdrs = await headers();
  const auth = await whopsdk.verifyUserToken(hdrs, { dontThrow: true });
  return resolveNudgeUserIdForBudgetApi(auth?.userId);
}

export async function GET(req: Request) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const experienceId = new URL(req.url).searchParams.get("experienceId")?.trim();
  if (!experienceId) {
    return NextResponse.json({ error: "Missing experienceId" }, { status: 400 });
  }

  const userId = await resolveBudgetUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const state = await fetchBudgetStateFromSupabase(experienceId, userId);
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

  const experienceId = new URL(req.url).searchParams.get("experienceId")?.trim();
  if (!experienceId) {
    return NextResponse.json({ error: "Missing experienceId" }, { status: 400 });
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
    await replaceBudgetStateInSupabase(experienceId, userId, state);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Nudge] PUT /api/budget-state failed", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
