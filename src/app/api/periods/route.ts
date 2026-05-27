import { NextResponse } from "next/server";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureCurrentPeriod, listPeriods } from "@/lib/budget/period-repo";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const ctx = await resolveMutationContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  const { data: wb } = await supabase.from("nudge_workbooks").select("period_anchor_day").eq("id", ctx.workbookId).single();
  const today = new Date().toISOString().slice(0, 10);
  const current = await ensureCurrentPeriod(ctx.workbookId, Number(wb?.period_anchor_day ?? 1), today);
  const periods = await listPeriods(ctx.workbookId);
  return NextResponse.json({ periods, currentPeriodId: current.id, periodAnchorDay: Number(wb?.period_anchor_day ?? 1) });
}
