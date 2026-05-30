import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";
import { readJson, nonNegativeNumber, dateKeyOf, boundedString } from "../_shared/validation";
import { resolvePeriodForDate } from "@/lib/budget/period-repo";
import { logActivity } from "@/lib/budget/activity";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

async function ctxOr401() {
  if (!isSupabasePersistenceEnabled()) return { error: NextResponse.json({ error: "Supabase not configured" }, { status: 503 }) };
  const ctx = await resolveMutationContext();
  if (!ctx) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { ctx };
}

/** Only accept a debt id that belongs to this workbook (debt_id has a single-column FK,
 *  so without this a transaction could reference another workbook's debt). */
async function debtIdForWorkbook(
  supabase: SupabaseClient,
  workbookId: string,
  raw: unknown,
): Promise<string | null> {
  if (raw == null) return null;
  const id = String(raw);
  const { data } = await supabase
    .from("nudge_debts")
    .select("id")
    .eq("id", id)
    .eq("workbook_id", workbookId)
    .maybeSingle();
  return data ? id : null;
}

async function anchorDayFor(supabase: SupabaseClient, workbookId: string): Promise<number> {
  const { data } = await supabase
    .from("nudge_workbooks")
    .select("period_anchor_day")
    .eq("id", workbookId)
    .single();
  return Number(data?.period_anchor_day ?? 1);
}

export async function POST(req: Request) {
  const r = await ctxOr401();
  if (r.error) return r.error;
  const { userId, workbookId } = r.ctx;
  const parsed = await readJson(req);
  if (parsed.error) return parsed.error;
  const body = parsed.body;
  const amount = nonNegativeNumber(body.amount);
  const supabase = getSupabaseAdmin();

  const today = new Date().toISOString().slice(0, 10);
  // File the transaction under the period its DATE belongs to (not "now"), so back/
  // forward-dated entries land in the correct cycle. Garbage dates fall back to today.
  const dateKey = dateKeyOf(body.date) ?? today;
  const storedDate = dateKeyOf(body.date) ? String(body.date) : today;
  const anchor = await anchorDayFor(supabase, workbookId);
  const period = await resolvePeriodForDate(workbookId, anchor, dateKey);
  const debtId = await debtIdForWorkbook(supabase, workbookId, body.debtId);

  const id = (body.id as string | undefined) ?? crypto.randomUUID();
  const { error } = await supabase.from("nudge_transactions").insert({
    id,
    workbook_id: workbookId,
    period_id: period.id,
    date: storedDate,
    amount,
    type: body.type === "income" ? "income" : "expense",
    category_id: body.categoryId ?? null,
    goal_id: body.goalId ?? null,
    debt_id: debtId,
    note: boundedString(body.note, 1000),
    created_by: userId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(workbookId, userId, "created", "transaction", id, `added a ${body.type === "income" ? "income" : "expense"} of ${amount}`);
  return NextResponse.json({ id });
}

export async function PATCH(req: Request) {
  const r = await ctxOr401();
  if (r.error) return r.error;
  const { workbookId, userId } = r.ctx;
  const parsed = await readJson(req);
  if (parsed.error) return parsed.error;
  const body = parsed.body;
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const id = String(body.id);
  const supabase = getSupabaseAdmin();
  const patch: Record<string, unknown> = {};
  if (body.date !== undefined) {
    const today = new Date().toISOString().slice(0, 10);
    const dateKey = dateKeyOf(body.date) ?? today;
    patch.date = dateKeyOf(body.date) ? String(body.date) : today;
    // A changed date can move the transaction into a different period — reassign it,
    // otherwise the row's period_id and date silently disagree.
    const anchor = await anchorDayFor(supabase, workbookId);
    const period = await resolvePeriodForDate(workbookId, anchor, dateKey);
    patch.period_id = period.id;
  }
  if (body.amount !== undefined) patch.amount = nonNegativeNumber(body.amount);
  if (body.type !== undefined) patch.type = body.type === "income" ? "income" : "expense";
  if (body.categoryId !== undefined) patch.category_id = body.categoryId;
  if (body.goalId !== undefined) patch.goal_id = body.goalId;
  if (body.debtId !== undefined) patch.debt_id = await debtIdForWorkbook(supabase, workbookId, body.debtId);
  if (body.note !== undefined) patch.note = boundedString(body.note, 1000);
  const { error } = await supabase
    .from("nudge_transactions")
    .update(patch)
    .eq("id", id)
    .eq("workbook_id", workbookId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(workbookId, userId, "updated", "transaction", id, "edited a transaction");
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
