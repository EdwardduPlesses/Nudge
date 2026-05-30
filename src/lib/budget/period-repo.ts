import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { periodRangeFor, clampAnchorDay, planPeriodsToCreate } from "./period-math";
import { materializeRecurring } from "./recurring";

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

  // Bounded plan that always ends at today's period and never overshoots past it,
  // even when the anchor day changed and shifted the grid (see planPeriodsToCreate).
  const toCreate = planPeriodsToCreate(periods.map((p) => p.startDate), anchor, todayIso);

  // Snapshot income/limits forward from the most recent period that starts before the
  // first new one (sorted descending → first match is the closest prior period).
  const firstNew = toCreate[0] ?? target.start;
  let snapshotFrom: PeriodRow | null =
    periods
      .filter((p) => p.startDate < firstNew)
      .sort((a, b) => (a.startDate < b.startDate ? 1 : -1))[0] ?? null;

  let last: PeriodRow | null = null;
  for (const start of toCreate) {
    const range = periodRangeFor(start, anchor);
    const created = await insertPeriod(workbookId, range.start, range.end);
    if (snapshotFrom) await copySnapshot(snapshotFrom.id, created.id);
    await materializeRecurring(workbookId, { id: created.id, startDate: created.startDate, endDate: created.endDate });
    last = created;
    snapshotFrom = created;
  }
  if (!last) {
    // Defensive: the plan always ends at today's period, but never return null.
    last = await insertPeriod(workbookId, target.start, target.end);
    await materializeRecurring(workbookId, { id: last.id, startDate: last.startDate, endDate: last.endDate });
  }
  return last;
}

/**
 * The period that contains `dateIso` for this workbook, creating exactly that one
 * period if it doesn't exist yet (snapshotting limits/income from the nearest prior
 * period). Used to file a transaction under the period its DATE belongs to — not the
 * current period — so back/forward-dated entries land in the correct cycle without
 * creating a chain of empty periods.
 */
export async function resolvePeriodForDate(
  workbookId: string,
  anchorDay: number,
  dateIso: string,
): Promise<PeriodRow> {
  const anchor = clampAnchorDay(anchorDay);
  const range = periodRangeFor(dateIso, anchor);
  const periods = await listPeriods(workbookId);
  const found = periods.find((p) => p.startDate === range.start);
  if (found) return found;

  const created = await insertPeriod(workbookId, range.start, range.end);
  const prior =
    periods
      .filter((p) => p.startDate < range.start)
      .sort((a, b) => (a.startDate < b.startDate ? 1 : -1))[0] ?? null;
  if (prior) await copySnapshot(prior.id, created.id);
  await materializeRecurring(workbookId, {
    id: created.id,
    startDate: created.startDate,
    endDate: created.endDate,
  });
  return created;
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
