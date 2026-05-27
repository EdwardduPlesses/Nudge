import { NextResponse } from "next/server";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { clampAnchorDay } from "@/lib/budget/period-math";
import { crossRate, decimalsFor, isDisplayCurrency } from "@/lib/currency-config";
import { getUsdRatesToTargets } from "@/lib/fx";
import { logActivity } from "@/lib/budget/activity";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const ctx = await resolveMutationContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const supabase = getSupabaseAdmin();

  if (body.periodAnchorDay !== undefined) {
    const day = clampAnchorDay(Number(body.periodAnchorDay));
    const { error } = await supabase.from("nudge_workbooks").update({ period_anchor_day: day }).eq("id", ctx.workbookId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, periodAnchorDay: day });
  }

  if (body.baseCurrency !== undefined) {
    const to = String(body.baseCurrency);
    if (!isDisplayCurrency(to)) return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
    const { data: wb, error: wbErr } = await supabase.from("nudge_workbooks").select("base_currency").eq("id", ctx.workbookId).single();
    if (wbErr) return NextResponse.json({ error: wbErr.message }, { status: 500 });
    const from = (wb.base_currency as string) ?? "USD";
    if (!isDisplayCurrency(from) || from === to) {
      await supabase.from("nudge_workbooks").update({ base_currency: to }).eq("id", ctx.workbookId);
      return NextResponse.json({ ok: true, baseCurrency: to });
    }
    const { rates } = await getUsdRatesToTargets();
    const rate = crossRate(from, to, rates);
    if (!Number.isFinite(rate) || rate <= 0) return NextResponse.json({ error: "Rate unavailable" }, { status: 502 });
    const { error: rpcErr } = await supabase.rpc("nudge_convert_workbook_currency", {
      p_workbook_id: ctx.workbookId,
      p_rate: rate,
      p_to_currency: to,
      p_decimals: decimalsFor(to),
    });
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    await logActivity(ctx.workbookId, ctx.userId, "updated", "workbook", ctx.workbookId, `changed budget currency to ${to}`);
    return NextResponse.json({ ok: true, baseCurrency: to });
  }

  return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
}
