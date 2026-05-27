import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const c = await resolveMutationContext();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.periodId || !body.whopUserId) return NextResponse.json({ error: "periodId+whopUserId required" }, { status: 400 });
  const supabase = getSupabaseAdmin();
  const { data: period } = await supabase.from("nudge_periods").select("workbook_id").eq("id", body.periodId).single();
  if (!period || period.workbook_id !== c.workbookId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { error } = await supabase.from("nudge_period_incomes").upsert(
    { period_id: body.periodId, whop_user_id: String(body.whopUserId), planned_amount: Math.max(0, Number(body.plannedAmount ?? 0)) },
    { onConflict: "period_id,whop_user_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
