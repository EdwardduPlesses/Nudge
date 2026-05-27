import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface RecurringItem {
  id: string;
  type: "income" | "expense";
  amount: number;
  categoryId: string | null;
  goalId: string | null;
  note: string;
  dayOfPeriod: number | null;
  ownerUserId: string;
  active: boolean;
}

function mapRow(r: Record<string, unknown>): RecurringItem {
  return {
    id: r.id as string,
    type: r.type === "income" ? "income" : "expense",
    amount: Number(r.amount) || 0,
    categoryId: (r.category_id as string) ?? null,
    goalId: (r.goal_id as string) ?? null,
    note: (r.note as string) ?? "",
    dayOfPeriod: r.day_of_period == null ? null : Number(r.day_of_period),
    ownerUserId: r.owner_user_id as string,
    active: Boolean(r.active),
  };
}

export async function listRecurring(workbookId: string): Promise<RecurringItem[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("nudge_recurring_items")
    .select("*")
    .eq("workbook_id", workbookId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

function addDaysIso(startIso: string, days: number): string {
  const [y, m, d] = startIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Materialize a workbook's active recurring items as transactions in `period`.
 * Idempotent: each materialized transaction id is derived from the recurring id +
 * period start, upserted with onConflict do-nothing, so re-running does not duplicate.
 */
export async function materializeRecurring(
  workbookId: string,
  period: { id: string; startDate: string; endDate: string },
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("nudge_recurring_items")
    .select("*")
    .eq("workbook_id", workbookId)
    .eq("active", true);
  if (error) throw error;
  const items = (data ?? []).map(mapRow);
  if (items.length === 0) return;

  const rows = items.map((it) => {
    const offset = it.dayOfPeriod && it.dayOfPeriod > 1 ? it.dayOfPeriod - 1 : 0;
    let date = addDaysIso(period.startDate, offset);
    if (date > period.endDate) date = period.endDate;
    return {
      id: `rec_${it.id}_${period.startDate}`,
      workbook_id: workbookId,
      period_id: period.id,
      date,
      amount: it.amount,
      type: it.type,
      category_id: it.categoryId,
      goal_id: it.goalId,
      note: it.note || "Recurring",
      created_by: it.ownerUserId,
    };
  });
  // Composite PK is (workbook_id, id); ignore duplicates so this is idempotent.
  await supabase.from("nudge_transactions").upsert(rows, { onConflict: "workbook_id,id", ignoreDuplicates: true });
}

export async function createRecurring(
  workbookId: string,
  ownerUserId: string,
  body: Partial<RecurringItem>,
): Promise<RecurringItem> {
  const supabase = getSupabaseAdmin();
  const id = body.id ?? (typeof crypto !== "undefined" && crypto.randomUUID ? `rec_${crypto.randomUUID()}` : `rec_${Date.now()}`);
  const { data, error } = await supabase
    .from("nudge_recurring_items")
    .insert({
      id,
      workbook_id: workbookId,
      type: body.type === "income" ? "income" : "expense",
      amount: Math.max(0, Number(body.amount ?? 0)),
      category_id: body.categoryId ?? null,
      goal_id: body.goalId ?? null,
      note: String(body.note ?? ""),
      day_of_period: body.dayOfPeriod ?? null,
      owner_user_id: ownerUserId,
      active: body.active ?? true,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapRow(data);
}

export async function updateRecurring(workbookId: string, id: string, body: Partial<RecurringItem>): Promise<void> {
  const supabase = getSupabaseAdmin();
  const patch: Record<string, unknown> = {};
  if (body.type !== undefined) patch.type = body.type === "income" ? "income" : "expense";
  if (body.amount !== undefined) patch.amount = Math.max(0, Number(body.amount));
  if (body.categoryId !== undefined) patch.category_id = body.categoryId;
  if (body.goalId !== undefined) patch.goal_id = body.goalId;
  if (body.note !== undefined) patch.note = String(body.note);
  if (body.dayOfPeriod !== undefined) patch.day_of_period = body.dayOfPeriod;
  if (body.active !== undefined) patch.active = body.active;
  const { error } = await supabase.from("nudge_recurring_items").update(patch).eq("id", id).eq("workbook_id", workbookId);
  if (error) throw error;
}

export async function deleteRecurring(workbookId: string, id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("nudge_recurring_items").delete().eq("id", id).eq("workbook_id", workbookId);
  if (error) throw error;
}
