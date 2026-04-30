import type { BudgetState, Category, Goal, Transaction } from "./types";
import { defaultBudgetState } from "./defaults";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type WorkbookRow = {
  id: string;
  income_plan: number;
};

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function mapCategory(r: {
  id: string;
  name: string;
  budget_limit: number;
  color: string;
}): Category {
  return {
    id: r.id,
    name: r.name,
    budgetLimit: num(r.budget_limit),
    color: r.color,
  };
}

function mapTransaction(r: {
  id: string;
  date: string;
  amount: number;
  type: string;
  category_id: string | null;
  goal_id?: string | null;
  note: string;
}): Transaction {
  const t = r.type === "income" ? "income" : "expense";
  const gid = r.goal_id;
  return {
    id: r.id,
    date: r.date,
    amount: num(r.amount),
    type: t,
    categoryId: r.category_id,
    goalId: gid === null || typeof gid === "string" ? gid : null,
    note: r.note ?? "",
  };
}

function mapGoal(r: {
  id: string;
  name: string;
  target_amount: number;
  saved_amount: number;
  deadline: string | null;
}): Goal {
  return {
    id: r.id,
    name: r.name,
    targetAmount: num(r.target_amount),
    savedAmount: num(r.saved_amount),
    deadline: r.deadline,
  };
}

export async function fetchBudgetStateFromSupabase(
  experienceId: string,
  whopUserId: string,
): Promise<BudgetState | null> {
  const supabase = getSupabaseAdmin();
  const { data: wb, error: wbErr } = await supabase
    .from("nudge_workbooks")
    .select("id, income_plan")
    .eq("experience_id", experienceId)
    .eq("whop_user_id", whopUserId)
    .maybeSingle();

  if (wbErr) throw wbErr;
  if (!wb) return null;

  const wbRow = wb as WorkbookRow;
  const workbookId = wbRow.id;

  const [catRes, txRes, goalRes] = await Promise.all([
    supabase.from("nudge_categories").select("id, name, budget_limit, color").eq("workbook_id", workbookId),
    supabase
      .from("nudge_transactions")
      .select("id, date, amount, type, category_id, goal_id, note")
      .eq("workbook_id", workbookId),
    supabase.from("nudge_goals").select("id, name, target_amount, saved_amount, deadline").eq("workbook_id", workbookId),
  ]);

  if (catRes.error) throw catRes.error;
  if (txRes.error) throw txRes.error;
  if (goalRes.error) throw goalRes.error;

  const categories = (catRes.data ?? []).map(mapCategory);
  const transactions = (txRes.data ?? []).map(mapTransaction);
  const goals = (goalRes.data ?? []).map(mapGoal);

  const base = defaultBudgetState();
  return {
    incomePlan: num(wbRow.income_plan, base.incomePlan),
    categories: categories.length > 0 ? categories : base.categories,
    transactions,
    goals,
  };
}

export async function replaceBudgetStateInSupabase(
  experienceId: string,
  whopUserId: string,
  state: BudgetState,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error: profileErr } = await supabase.from("nudge_profiles").upsert(
    { whop_user_id: whopUserId },
    { onConflict: "whop_user_id" },
  );
  if (profileErr) throw profileErr;

  const { data: wbUpsert, error: wbUpsertErr } = await supabase
    .from("nudge_workbooks")
    .upsert(
      {
        experience_id: experienceId,
        whop_user_id: whopUserId,
        income_plan: state.incomePlan,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "experience_id,whop_user_id" },
    )
    .select("id")
    .single();

  if (wbUpsertErr) throw wbUpsertErr;
  const workbookId = wbUpsert.id as string;

  const { error: delTx } = await supabase.from("nudge_transactions").delete().eq("workbook_id", workbookId);
  if (delTx) throw delTx;
  const { error: delGoals } = await supabase.from("nudge_goals").delete().eq("workbook_id", workbookId);
  if (delGoals) throw delGoals;
  const { error: delCat } = await supabase.from("nudge_categories").delete().eq("workbook_id", workbookId);
  if (delCat) throw delCat;

  if (state.categories.length > 0) {
    const { error: catIns } = await supabase.from("nudge_categories").insert(
      state.categories.map((c) => ({
        id: c.id,
        workbook_id: workbookId,
        name: c.name,
        budget_limit: c.budgetLimit,
        color: c.color,
      })),
    );
    if (catIns) throw catIns;
  }

  if (state.goals.length > 0) {
    const { error: goalIns } = await supabase.from("nudge_goals").insert(
      state.goals.map((g) => ({
        id: g.id,
        workbook_id: workbookId,
        name: g.name,
        target_amount: g.targetAmount,
        saved_amount: g.savedAmount,
        deadline: g.deadline,
      })),
    );
    if (goalIns) throw goalIns;
  }

  if (state.transactions.length > 0) {
    const { error: txIns } = await supabase.from("nudge_transactions").insert(
      state.transactions.map((t) => ({
        id: t.id,
        workbook_id: workbookId,
        date: t.date,
        amount: t.amount,
        type: t.type,
        category_id: t.categoryId,
        goal_id: t.goalId,
        note: t.note,
      })),
    );
    if (txIns) throw txIns;
  }
}
