import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";
import { logActivity } from "@/lib/budget/activity";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const c = await resolveMutationContext();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.periodId || !body.categoryId) return NextResponse.json({ error: "periodId+categoryId required" }, { status: 400 });
  const supabase = getSupabaseAdmin();
  const { data: period } = await supabase.from("nudge_periods").select("workbook_id").eq("id", body.periodId).single();
  if (!period || period.workbook_id !== c.workbookId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { error } = await supabase.from("nudge_period_category_limits").upsert(
    { period_id: body.periodId, category_id: body.categoryId, budget_limit: Math.max(0, Number(body.budgetLimit ?? 0)) },
    { onConflict: "period_id,category_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(c.workbookId, c.userId, "updated", "limit", null, "changed a category limit");
  return NextResponse.json({ ok: true });
}
