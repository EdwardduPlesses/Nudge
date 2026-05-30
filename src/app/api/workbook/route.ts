import { NextResponse } from "next/server";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";
import { readJson } from "../_shared/validation";
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
  const parsed = await readJson(req);
  if (parsed.error) return parsed.error;
  const body = parsed.body;
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
    // Convert on LIVE rates only. Converting on the stale hardcoded fallback would
    // silently multiply every stored amount by an out-of-date rate with no recovery
    // path, while telling the user it used "today's rate" (P1).
    const { rates, stale } = await getUsdRatesToTargets();
    if (stale) {
      return NextResponse.json(
        { error: "Live exchange rates are unavailable right now. Please try again shortly." },
        { status: 503 },
      );
    }
    const rate = crossRate(from, to, rates);
    if (!Number.isFinite(rate) || rate <= 0) return NextResponse.json({ error: "Rate unavailable" }, { status: 502 });

    // Atomic compare-and-swap: claim the `from`→`to` transition in a single statement.
    // Only the request that actually flips base_currency away from `from` proceeds to
    // multiply amounts; a racing double-tap, a client retry, or a second shared-workbook
    // member matches 0 rows here and skips the conversion entirely. Without this, two
    // concurrent changes each multiplied every amount, corrupting all money ~rate² (P0).
    const { data: claimed, error: claimErr } = await supabase
      .from("nudge_workbooks")
      .update({ base_currency: to })
      .eq("id", ctx.workbookId)
      .eq("base_currency", from)
      .select("id");
    if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 });
    if (!claimed || claimed.length === 0) {
      // Lost the race / duplicate request — the conversion already ran. No-op.
      return NextResponse.json({ ok: true, baseCurrency: to, alreadyApplied: true });
    }

    const { error: rpcErr } = await supabase.rpc("nudge_convert_workbook_currency", {
      p_workbook_id: ctx.workbookId,
      p_rate: rate,
      p_to_currency: to,
      p_decimals: decimalsFor(to),
    });
    if (rpcErr) {
      // The amount multiply failed after we claimed the transition. Roll the currency
      // flag back so we don't leave `to` set with un-converted `from` amounts.
      await supabase
        .from("nudge_workbooks")
        .update({ base_currency: from })
        .eq("id", ctx.workbookId)
        .eq("base_currency", to);
      return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    }
    await logActivity(ctx.workbookId, ctx.userId, "updated", "workbook", ctx.workbookId, `changed budget currency to ${to}`);
    return NextResponse.json({ ok: true, baseCurrency: to });
  }

  return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
}
