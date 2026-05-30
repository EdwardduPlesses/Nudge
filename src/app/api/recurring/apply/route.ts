import { NextResponse } from "next/server";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveMutationContext } from "../../_shared/workbook-mutation";
import { logActivity } from "@/lib/budget/activity";
import { ensureCurrentPeriod } from "@/lib/budget/period-repo";
import { materializeRecurring } from "@/lib/budget/recurring";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  const c = await resolveMutationContext();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { userId, workbookId } = c;
  try {
    const supabase = getSupabaseAdmin();
    const { data: wb, error: wbError } = await supabase
      .from("nudge_workbooks")
      .select("period_anchor_day")
      .eq("id", workbookId)
      .single();
    if (wbError) throw wbError;
    const anchorDay = Number(wb?.period_anchor_day ?? 1);
    const today = new Date().toISOString().slice(0, 10);
    const period = await ensureCurrentPeriod(workbookId, anchorDay, today);
    const added = await materializeRecurring(workbookId, period);
    if (added > 0) {
      await logActivity(
        workbookId,
        userId,
        "created",
        "recurring",
        period.id,
        `applied ${added} recurring item${added === 1 ? "" : "s"} to this period`,
      );
    }
    return NextResponse.json({ added });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
