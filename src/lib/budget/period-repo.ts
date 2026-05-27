import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { periodRangeFor, nextPeriodStart, clampAnchorDay } from "./period-math";

export interface PeriodRow {
  id: string;
  startDate: string;
  endDate: string;
  label: string | null;
}

function labelFor(start: string): string {
  const [y, m] = start.split("-").map(Number);
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${name} ${y}`;
}

export async function listPeriods(workbookId: string): Promise<PeriodRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("nudge_periods")
    .select("id, start_date, end_date, label")
    .eq("workbook_id", workbookId)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    startDate: r.start_date as string,
    endDate: r.end_date as string,
    label: (r.label as string) ?? null,
  }));
}

/**
 * Ensure a period exists for `todayIso`. If the latest period ends before today, roll
 * forward by snapshotting income + category limits into each new period. Returns the
 * current period row.
 */
export async function ensureCurrentPeriod(
  workbookId: string,
  anchorDay: number,
  todayIso: string,
): Promise<PeriodRow> {
  const anchor = clampAnchorDay(anchorDay);
  const target = periodRangeFor(todayIso, anchor);

  const periods = await listPeriods(workbookId);
  const found = periods.find((p) => p.startDate === target.start);
  if (found) return found;

  const latest = periods[0] ?? null;

  let cursorStart = latest ? nextPeriodStart(latest.startDate, anchor) : target.start;
  let last: PeriodRow | null = null;
  let snapshotFrom = latest;
  for (let i = 0; i < 240; i++) {
    const range = periodRangeFor(cursorStart, anchor);
    const created = await insertPeriod(workbookId, range.start, range.end);
    if (snapshotFrom) await copySnapshot(snapshotFrom.id, created.id);
    last = created;
    snapshotFrom = created;
    if (range.start === target.start) break;
    cursorStart = nextPeriodStart(range.start, anchor);
  }
  if (!last) {
    last = await insertPeriod(workbookId, target.start, target.end);
  }
  return last;
}

async function insertPeriod(workbookId: string, start: string, end: string): Promise<PeriodRow> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("nudge_periods")
    .upsert(
      { workbook_id: workbookId, start_date: start, end_date: end, label: labelFor(start) },
      { onConflict: "workbook_id,start_date" },
    )
    .select("id, start_date, end_date, label")
    .single();
  if (error) throw error;
  return {
    id: data.id as string,
    startDate: data.start_date as string,
    endDate: data.end_date as string,
    label: (data.label as string) ?? null,
  };
}

/** Copy per-member income and per-category limits from one period to another. */
async function copySnapshot(fromPeriodId: string, toPeriodId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const [{ data: incomes }, { data: limits }] = await Promise.all([
    supabase.from("nudge_period_incomes").select("whop_user_id, planned_amount").eq("period_id", fromPeriodId),
    supabase.from("nudge_period_category_limits").select("category_id, budget_limit").eq("period_id", fromPeriodId),
  ]);
  if (incomes?.length) {
    await supabase.from("nudge_period_incomes").upsert(
      incomes.map((r) => ({ period_id: toPeriodId, whop_user_id: r.whop_user_id, planned_amount: r.planned_amount })),
      { onConflict: "period_id,whop_user_id" },
    );
  }
  if (limits?.length) {
    await supabase.from("nudge_period_category_limits").upsert(
      limits.map((r) => ({ period_id: toPeriodId, category_id: r.category_id, budget_limit: r.budget_limit })),
      { onConflict: "period_id,category_id" },
    );
  }
}
