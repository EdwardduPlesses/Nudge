import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";
import { logActivity } from "@/lib/budget/activity";

export const dynamic = "force-dynamic";

async function ctx() {
  if (!isSupabasePersistenceEnabled()) return { error: NextResponse.json({ error: "Supabase not configured" }, { status: 503 }) };
  const c = await resolveMutationContext();
  if (!c) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { c };
}

export async function POST(req: Request) {
  const r = await ctx(); if (r.error) return r.error;
  const { userId, workbookId } = r.c;
  const body = await req.json();
  const id = body.id ?? crypto.randomUUID();
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("nudge_goals").insert({
    id, workbook_id: workbookId, name: String(body.name ?? "Goal"),
    target_amount: Math.max(0, Number(body.targetAmount ?? 0)),
    saved_amount: Math.max(0, Number(body.savedAmount ?? 0)),
    deadline: body.deadline ?? null, created_by: userId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(workbookId, userId, "created", "goal", id, `created goal ${String(body.name ?? "Goal")}`);
  return NextResponse.json({ id });
}

export async function PATCH(req: Request) {
  const r = await ctx(); if (r.error) return r.error;
  const { workbookId, userId } = r.c;
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name);
  if (body.targetAmount !== undefined) patch.target_amount = Math.max(0, Number(body.targetAmount));
  if (body.deadline !== undefined) patch.deadline = body.deadline;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("nudge_goals").update(patch).eq("id", body.id).eq("workbook_id", workbookId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(workbookId, userId, "updated", "goal", body.id, "updated a goal");
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const r = await ctx(); if (r.error) return r.error;
  const { workbookId, userId } = r.c;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = getSupabaseAdmin();
  await supabase.from("nudge_transactions").update({ goal_id: null }).eq("goal_id", id).eq("workbook_id", workbookId);
  const { error } = await supabase.from("nudge_goals").delete().eq("id", id).eq("workbook_id", workbookId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(workbookId, userId, "deleted", "goal", id, "removed a goal");
  return NextResponse.json({ ok: true });
}
