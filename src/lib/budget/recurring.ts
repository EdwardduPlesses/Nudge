import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Sentinel stored in `day_of_period` to mean "fire at period end". The column predates the
 *  start/end-only model: null = start, this sentinel = end. Legacy 1-28 values read as start. */
export const FIRES_AT_END = 999 as const;

export type RecurringTiming = "start" | "end";

export interface RecurringItem {
  id: string;
  type: "income" | "expense";
  amount: number;
  categoryId: string | null;
  goalId: string | null;
  note: string;
  timing: RecurringTiming;
  ownerUserId: string;
  active: boolean;
}

/** Row shape upserted into nudge_transactions when materializing recurring items. */
export interface RecurringTxnRow {
  id: string;
  workbook_id: string;
  period_id: string;
  date: string;
  amount: number;
  type: "income" | "expense";
  category_id: string | null;
  goal_id: string | null;
  note: string;
  created_by: string;
}

/** DB day_of_period -> timing. null / legacy 1-28 = start; sentinel (>=29) = end. */
export function timingFromDayOfPeriod(dayOfPeriod: unknown): RecurringTiming {
  return Number(dayOfPeriod) >= 29 ? "end" : "start";
}

/** timing -> DB day_of_period. end = sentinel; start (or unset) = null. */
export function dayOfPeriodForTiming(timing: RecurringTiming | undefined): number | null {
  return timing === "end" ? FIRES_AT_END : null;
}

function mapRow(r: Record<string, unknown>): RecurringItem {
  return {
    id: r.id as string,
    type: r.type === "income" ? "income" : "expense",
    amount: Number(r.amount) || 0,
    categoryId: (r.category_id as string) ?? null,
    goalId: (r.goal_id as string) ?? null,
    note: (r.note as string) ?? "",
    timing: timingFromDayOfPeriod(r.day_of_period),
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

/** Build transaction rows for a period from active recurring items. Pure (no I/O) so the
 *  date/timing logic is unit-testable. start -> period.startDate, end -> period.endDate. */
export function recurringRowsFor(
  workbookId: string,
  items: RecurringItem[],
  period: { id: string; startDate: string; endDate: string },
): RecurringTxnRow[] {
  return items.map((it) => ({
    id: `rec_${it.id}_${period.startDate}`,
    workbook_id: workbookId,
    period_id: period.id,
    date: it.timing === "end" ? period.endDate : period.startDate,
    amount: it.amount,
    type: it.type,
    category_id: it.categoryId,
    goal_id: it.goalId,
    note: it.note || "Recurring",
    created_by: it.ownerUserId,
  }));
}

/**
 * Materialize a workbook's active recurring items as transactions in `period`.
 * Idempotent: each materialized transaction id is derived from the recurring id +
 * period start, upserted with onConflict do-nothing, so re-running does not duplicate.
 * Returns the number of NEWLY inserted transactions (0 if all already existed).
 */
export async function materializeRecurring(
  workbookId: string,
  period: { id: string; startDate: string; endDate: string },
): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("nudge_recurring_items")
    .select("*")
    .eq("workbook_id", workbookId)
    .eq("active", true);
  if (error) throw error;
  const items = (data ?? []).map(mapRow);
  if (items.length === 0) return 0;

  const rows = recurringRowsFor(workbookId, items, period);
  // Composite PK is (workbook_id, id); ignore duplicates so this is idempotent. With
  // ignoreDuplicates, .select() returns only the rows actually inserted -> newly-added count.
  const { data: inserted, error: upsertError } = await supabase
    .from("nudge_transactions")
    .upsert(rows, { onConflict: "workbook_id,id", ignoreDuplicates: true })
    .select("id");
  if (upsertError) throw upsertError;
  return inserted?.length ?? 0;
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
      note: String(body.note ?? "").slice(0, 1000),
      day_of_period: dayOfPeriodForTiming(body.timing),
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
  if (body.note !== undefined) patch.note = String(body.note).slice(0, 1000);
  if (body.timing !== undefined) patch.day_of_period = dayOfPeriodForTiming(body.timing);
  if (body.active !== undefined) patch.active = body.active;
  const { error } = await supabase.from("nudge_recurring_items").update(patch).eq("id", id).eq("workbook_id", workbookId);
  if (error) throw error;
}

export async function deleteRecurring(workbookId: string, id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("nudge_recurring_items").delete().eq("id", id).eq("workbook_id", workbookId);
  if (error) throw error;
}
