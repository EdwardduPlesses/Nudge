import { NextResponse } from "next/server";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { clampAnchorDay } from "@/lib/budget/period-math";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const ctx = await resolveMutationContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (body.periodAnchorDay === undefined) return NextResponse.json({ error: "periodAnchorDay required" }, { status: 400 });
  const day = clampAnchorDay(Number(body.periodAnchorDay));
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("nudge_workbooks").update({ period_anchor_day: day }).eq("id", ctx.workbookId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, periodAnchorDay: day });
}
