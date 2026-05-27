import type { BudgetState, Category, Goal, Member, MemberIncome, Transaction } from "./types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureActiveWorkbook } from "./workbook-access";
import { ensureCurrentPeriod, listPeriods, type PeriodRow } from "./period-repo";
import { ensureMemberProfiles } from "./activity";

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

async function loadWorkbookMeta(workbookId: string): Promise<{ anchorDay: number; members: Member[] }> {
  const supabase = getSupabaseAdmin();
  const { data: wb, error: wbErr } = await supabase
    .from("nudge_workbooks")
    .select("period_anchor_day")
    .eq("id", workbookId)
    .single();
  if (wbErr) throw wbErr;
  const enriched = await ensureMemberProfiles(workbookId);
  return {
    anchorDay: num(wb.period_anchor_day, 1),
    members: enriched.map((m) => ({
      whopUserId: m.whopUserId,
      role: m.role as "owner" | "member",
      displayName: m.displayName,
      color: m.color,
    })),
  };
}

/**
 * Load one period's slice for the caller. If `periodId` is given, that period is loaded
 * (read-only when it's not the current period); otherwise the current period is ensured.
 */
export async function fetchBudgetStateForUser(
  whopUserId: string,
  todayIso: string,
  periodId?: string | null,
): Promise<BudgetState> {
  const supabase = getSupabaseAdmin();
  const workbookId = await ensureActiveWorkbook(whopUserId);
  const { anchorDay, members } = await loadWorkbookMeta(workbookId);
  const current = await ensureCurrentPeriod(workbookId, anchorDay, todayIso);

  let period: PeriodRow = current;
  if (periodId && periodId !== current.id) {
    const all = await listPeriods(workbookId);
    const sel = all.find((p) => p.id === periodId);
    if (sel) period = sel;
  }
  const editable = period.id === current.id;

  const [incomeRes, catRes, limitRes, txRes, goalRes] = await Promise.all([
    supabase.from("nudge_period_incomes").select("whop_user_id, planned_amount").eq("period_id", period.id),
    supabase.from("nudge_categories").select("id, name, color, created_by").eq("workbook_id", workbookId),
    supabase.from("nudge_period_category_limits").select("category_id, budget_limit").eq("period_id", period.id),
    supabase
      .from("nudge_transactions")
      .select("id, date, amount, type, category_id, goal_id, debt_id, note, created_by, period_id")
      .eq("period_id", period.id),
    supabase.from("nudge_goals").select("id, name, target_amount, saved_amount, deadline, created_by").eq("workbook_id", workbookId),
  ]);
  for (const r of [incomeRes, catRes, limitRes, txRes, goalRes]) if (r.error) throw r.error;

  const limitByCat = new Map<string, number>(
    (limitRes.data ?? []).map((r) => [r.category_id as string, num(r.budget_limit)]),
  );
  const categories: Category[] = (catRes.data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    color: r.color as string,
    budgetLimit: limitByCat.get(r.id as string) ?? 0,
    createdBy: (r.created_by as string) ?? null,
  }));
  const transactions: Transaction[] = (txRes.data ?? []).map((r) => ({
    id: r.id as string,
    date: r.date as string,
    amount: num(r.amount),
    type: r.type === "income" ? "income" : "expense",
    categoryId: (r.category_id as string) ?? null,
    goalId: (r.goal_id as string) ?? null,
    note: (r.note as string) ?? "",
    createdBy: (r.created_by as string) ?? null,
    periodId: (r.period_id as string) ?? null,
  }));
  const goals: Goal[] = (goalRes.data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    targetAmount: num(r.target_amount),
    savedAmount: num(r.saved_amount),
    deadline: (r.deadline as string) ?? null,
    createdBy: (r.created_by as string) ?? null,
  }));
  const memberIncomes: MemberIncome[] = (incomeRes.data ?? []).map((r) => ({
    whopUserId: r.whop_user_id as string,
    plannedAmount: num(r.planned_amount),
  }));

  return {
    workbookId,
    periodAnchorDay: anchorDay,
    members,
    period: { id: period.id, startDate: period.startDate, endDate: period.endDate, label: period.label },
    editable,
    memberIncomes,
    categories,
    transactions,
    goals,
  };
}
