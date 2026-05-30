import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { periodRangeFor, clampAnchorDay } from "@/lib/budget/period-math";

/**
 * Verify `periodId` is THIS workbook's CURRENT period. Per-period budget config
 * (planned income, category limits) is immutable history once a period closes, so
 * mutations must target the current period only. Returns null when allowed, or an
 * error Response: 403 if the period isn't in the workbook, 409 if it's a closed
 * (non-current) period — the 409 lets the client resync to the new current period.
 */
export async function assertCurrentPeriod(
  workbookId: string,
  periodId: string,
): Promise<NextResponse | null> {
  const supabase = getSupabaseAdmin();
  const [{ data: wb }, { data: period }] = await Promise.all([
    supabase.from("nudge_workbooks").select("period_anchor_day").eq("id", workbookId).single(),
    supabase.from("nudge_periods").select("workbook_id, start_date").eq("id", periodId).maybeSingle(),
  ]);
  if (!period || period.workbook_id !== workbookId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const today = new Date().toISOString().slice(0, 10);
  const currentStart = periodRangeFor(today, clampAnchorDay(Number(wb?.period_anchor_day ?? 1))).start;
  if (period.start_date !== currentStart) {
    return NextResponse.json(
      { error: "That budget period is closed. Reload to edit the current period." },
      { status: 409 },
    );
  }
  return null;
}
