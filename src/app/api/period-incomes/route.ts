import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";
import { readJson, nonNegativeNumber } from "../_shared/validation";
import { assertCurrentPeriod } from "../_shared/period-guard";
import { userIsWorkbookMember } from "@/lib/budget/workbook-access";
import { logActivity } from "@/lib/budget/activity";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const c = await resolveMutationContext();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await readJson(req);
  if (parsed.error) return parsed.error;
  const body = parsed.body;
  if (!body.periodId || !body.whopUserId) return NextResponse.json({ error: "periodId+whopUserId required" }, { status: 400 });
  const supabase = getSupabaseAdmin();
  // Income plans are immutable once a period closes — only the current period is editable.
  const periodErr = await assertCurrentPeriod(c.workbookId, String(body.periodId));
  if (periodErr) return periodErr;
  // Only let members set income rows for actual members of this workbook (no arbitrary user-id injection).
  if (!(await userIsWorkbookMember(String(body.whopUserId), c.workbookId))) {
    return NextResponse.json({ error: "Not a workbook member" }, { status: 403 });
  }
  const { error } = await supabase.from("nudge_period_incomes").upsert(
    { period_id: body.periodId, whop_user_id: String(body.whopUserId), planned_amount: nonNegativeNumber(body.plannedAmount) },
    { onConflict: "period_id,whop_user_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(c.workbookId, c.userId, "updated", "income", null, "updated planned income");
  return NextResponse.json({ ok: true });
}
