import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";
import { ensureCurrentPeriod } from "@/lib/budget/period-repo";
import { logActivity } from "@/lib/budget/activity";

export const dynamic = "force-dynamic";

async function ctxOr401() {
  if (!isSupabasePersistenceEnabled()) return { error: NextResponse.json({ error: "Supabase not configured" }, { status: 503 }) };
  const ctx = await resolveMutationContext();
  if (!ctx) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { ctx };
}

export async function POST(req: Request) {
  const r = await ctxOr401();
  if (r.error) return r.error;
  const { userId, workbookId } = r.ctx;
  const body = await req.json();
  const supabase = getSupabaseAdmin();

  const today = new Date().toISOString().slice(0, 10);
  const { data: wb } = await supabase.from("nudge_workbooks").select("period_anchor_day").eq("id", workbookId).single();
  const period = await ensureCurrentPeriod(workbookId, Number(wb?.period_anchor_day ?? 1), today);

  const id = body.id ?? crypto.randomUUID();
  const { error } = await supabase.from("nudge_transactions").insert({
    id,
    workbook_id: workbookId,
    period_id: period.id,
    date: String(body.date ?? today),
    amount: Number(body.amount ?? 0),
    type: body.type === "income" ? "income" : "expense",
    category_id: body.categoryId ?? null,
    goal_id: body.goalId ?? null,
    debt_id: body.debtId ?? null,
    note: String(body.note ?? ""),
    created_by: userId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(workbookId, userId, "created", "transaction", id, `added a ${body.type === "income" ? "income" : "expense"} of ${Number(body.amount ?? 0)}`);
  return NextResponse.json({ id });
}

export async function PATCH(req: Request) {
  const r = await ctxOr401();
  if (r.error) return r.error;
  const { workbookId, userId } = r.ctx;
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = getSupabaseAdmin();
  const patch: Record<string, unknown> = {};
  if (body.date !== undefined) patch.date = String(body.date);
  if (body.amount !== undefined) patch.amount = Number(body.amount);
  if (body.type !== undefined) patch.type = body.type === "income" ? "income" : "expense";
  if (body.categoryId !== undefined) patch.category_id = body.categoryId;
  if (body.goalId !== undefined) patch.goal_id = body.goalId;
  if (body.debtId !== undefined) patch.debt_id = body.debtId;
  if (body.note !== undefined) patch.note = String(body.note);
  const { error } = await supabase
    .from("nudge_transactions")
    .update(patch)
    .eq("id", body.id)
    .eq("workbook_id", workbookId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(workbookId, userId, "updated", "transaction", body.id, "edited a transaction");
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const r = await ctxOr401();
  if (r.error) return r.error;
  const { workbookId, userId } = r.ctx;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("nudge_transactions")
    .delete()
    .eq("id", id)
    .eq("workbook_id", workbookId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(workbookId, userId, "deleted", "transaction", id, "removed a transaction");
  return NextResponse.json({ ok: true });
}
