import { differenceInCalendarMonths, format, parseISO } from "date-fns";
import type { BudgetState } from "@/lib/budget/types";
import {
  goalDisplaySaved,
  safeToSpendToday,
  sumIncome,
  totalGoalsSavedUsd,
  totalPlannedIncome,
  transactionsInPeriod,
} from "@/lib/budget/selectors";
import { computeMonthlySpendingVelocity, periodDayCounts } from "@/lib/budget/velocity";
import { computeCategoryHealthRows } from "@/lib/budget/category-health";
import { computeMonthlyRemaining } from "@/lib/budget/monthly-remaining";
import {
  addMonthsIso,
  debtRemaining,
  payoffOrder,
  projectDebtFreeMonths,
  type DebtInput,
} from "@/lib/budget/debt";

const TX_CAP = 20;

export interface MoneyPlanInputs {
  /** Workbook debts (live outside BudgetState; fetched separately by the caller). */
  debts?: DebtInput[];
  /** ISO currency code the amounts are denominated in (e.g. "ZAR"). */
  currencyCode?: string;
  /** Reference "now" — injectable for deterministic tests. */
  now?: Date;
}

function safeName(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function isoDay(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "yyyy-MM-dd");
  } catch {
    return dateStr;
  }
}

function statusWord(status: "ON_TRACK" | "WARNING" | "OVERSPENDING" | undefined): string {
  switch (status) {
    case "ON_TRACK":
      return "On track";
    case "WARNING":
      return "Warning";
    case "OVERSPENDING":
      return "Overspending";
    default:
      return "Not available (no category limits set)";
  }
}

/** Most recent transactions first by `date` field (ISO-like). */
function recentTransactionsDescending(transactions: BudgetState["transactions"]) {
  const copy = [...transactions];
  copy.sort((a, b) => {
    try {
      return parseISO(b.date).getTime() - parseISO(a.date).getTime();
    } catch {
      return String(b.date).localeCompare(String(a.date));
    }
  });
  return copy.slice(0, TX_CAP);
}

/**
 * Builds the period header + precomputed-facts block. Everything here is computed in code
 * (period-correct, deterministic) so the model narrates rather than recomputes.
 */
function buildFactsBlock(
  budgetState: BudgetState,
  fm: (amount: number) => string,
  now: Date,
  debts: DebtInput[],
): string[] {
  const { period } = budgetState;
  const periodTx = transactionsInPeriod(budgetState.transactions, period);
  const counts = periodDayCounts(period, now);

  // Expense composition over the period (kept distinct so the snapshot reconciles with
  // the per-category table: category spend excludes savings allocations and debt payments).
  const expenseTx = periodTx.filter((t) => t.type === "expense");
  const goalAllocations = expenseTx
    .filter((t) => t.goalId != null)
    .reduce((s, t) => s + (Number.isFinite(t.amount) ? t.amount : 0), 0);
  const debtPayments = expenseTx
    .filter((t) => t.goalId == null && t.debtId != null)
    .reduce((s, t) => s + (Number.isFinite(t.amount) ? t.amount : 0), 0);
  const categorySpend = expenseTx
    .filter((t) => t.goalId == null && t.debtId == null)
    .reduce((s, t) => s + (Number.isFinite(t.amount) ? t.amount : 0), 0);
  const incomeLogged = sumIncome(periodTx);

  const plannedIncome = totalPlannedIncome(budgetState);
  const remaining = computeMonthlyRemaining(budgetState);
  const velocity = computeMonthlySpendingVelocity(periodTx, budgetState.categories, period, now);
  const health = computeCategoryHealthRows({
    categories: budgetState.categories,
    transactions: periodTx,
  });
  const safe = safeToSpendToday(budgetState, now);

  const lines: string[] = [];

  lines.push(
    "## Budget period & status (precomputed — use verbatim, do not recompute)",
    `- Budget period: **${period.label ?? "current period"}** — ${period.startDate} to ${period.endDate} (this may NOT be a calendar month).`,
    `- As-of: ${format(now, "yyyy-MM-dd")} — day ${counts.daysPassed} of ${counts.totalDays}; **${counts.remainingInclusiveDays} days remaining** in the period.`,
    `- Planned income for the period: ${fm(plannedIncome)}`,
    `- Logged income so far: ${fm(incomeLogged)}`,
    `- Category spending so far (excludes savings & debt payments): ${fm(categorySpend)}`,
    `- Savings allocations so far: ${fm(goalAllocations)}`,
    `- Debt payments so far: ${fm(debtPayments)}`,
    `- Money still available this period: ${fm(remaining.availableThisMonthUsd)}${remaining.isOverBudget ? " — **over budget**" : ""}`,
  );

  // Forward-looking, period-correct spend signals.
  lines.push(
    "",
    "## Spending forecast (precomputed — use verbatim)",
    `- Total category limits (budget): ${velocity.hasBudget ? fm(velocity.budget) : "(missing — no limits set)"}`,
    `- Total outflow so far (category spend + savings + debt): ${fm(velocity.totalSpent)}`,
    `- Projected outflow by period end (at current pace): ${velocity.hasExpenseData ? fm(velocity.forecast) : "(missing — no expenses logged yet)"}`,
    `- Pace status: **${statusWord(velocity.status)}**`,
  );
  if (safe) {
    lines.push(
      `- Safe to spend: ~${fm(safe.perDayUsd)} per day across the ${safe.daysRemaining} remaining days (income minus everything logged; ${fm(safe.discretionaryRemainingUsd)} left).`,
    );
  }
  if (velocity.dailyReductionUsd != null) {
    lines.push(
      `- To get back on track, cut ~${fm(velocity.dailyReductionUsd)} per day from the current pace.`,
    );
  }

  // Per-category health table — supplied so the model uses these %/status verbatim.
  lines.push("", "## Per-category health (precomputed — use the %used and status verbatim)");
  if (health.length === 0) {
    lines.push("(No categories defined.)");
  } else {
    lines.push("| Category | Limit | Spent | % used | Status |");
    lines.push("|---|---|---|---|---|");
    for (const row of health) {
      const limit = row.categoryLimitUsd > 0 ? fm(row.categoryLimitUsd) : "(no limit)";
      const pct = row.percentUsed == null ? "—" : `${Math.round(row.percentUsed)}%`;
      const status = row.status ?? "No limit";
      lines.push(
        `| ${safeName(row.name, "Uncategorized")} | ${limit} | ${fm(row.currentMonthCategorySpendUsd)} | ${pct} | ${status} |`,
      );
    }
  }

  // Goals with deadline feasibility math.
  lines.push("", "## Savings goals (precomputed)");
  if (budgetState.goals.length === 0) {
    lines.push("(No savings goals recorded.)");
  } else {
    const totalSaved = totalGoalsSavedUsd(budgetState.goals, budgetState.transactions);
    for (const g of budgetState.goals) {
      const name = safeName(g.name, "Goal");
      const saved = goalDisplaySaved(g, budgetState.transactions);
      const target = g.targetAmount;
      let line = `- **${name}** — saved ${fm(saved)} of ${fm(target)}`;
      if (Number.isFinite(target) && target > 0 && Number.isFinite(saved)) {
        line += ` (${Math.min(100, Math.round((100 * Math.max(0, saved)) / target))}%)`;
      }
      if (g.deadline && g.deadline.trim().length > 0) {
        const deadlineDay = isoDay(g.deadline.trim());
        const gap = Math.max(0, (Number.isFinite(target) ? target : 0) - Math.max(0, saved));
        if (saved >= target && target > 0) {
          line += `; target met (deadline ${deadlineDay}).`;
        } else {
          let monthsLeft = NaN;
          try {
            monthsLeft = differenceInCalendarMonths(parseISO(g.deadline.trim()), now);
          } catch {
            /* keep NaN */
          }
          if (!Number.isFinite(monthsLeft) || monthsLeft <= 0) {
            line += `; deadline ${deadlineDay} has passed — short by ${fm(gap)}.`;
          } else {
            line += `; needs ${fm(gap / monthsLeft)} per month for ${monthsLeft} month(s) to reach target by ${deadlineDay}.`;
          }
        }
      }
      lines.push(line);
    }
    lines.push(`- Total saved across goals: ${fm(totalSaved)}`);
  }

  // Debts — the highest-leverage section and previously entirely absent.
  lines.push("", "## Debts (precomputed — use verbatim)");
  if (debts.length === 0) {
    lines.push("(No debts recorded.)");
  } else {
    const txs = budgetState.transactions;
    const totalRemaining = debts.reduce((s, d) => s + debtRemaining(d, txs), 0);
    lines.push(`- Total remaining debt: ${fm(totalRemaining)}`);
    lines.push("| Debt | Remaining | APR | Min payment |");
    lines.push("|---|---|---|---|");
    for (const d of debts) {
      lines.push(
        `| ${safeName(d.name, "Debt")} | ${fm(debtRemaining(d, txs))} | ${Number.isFinite(d.apr) ? `${d.apr}%` : "(missing)"} | ${fm(d.minPayment)} |`,
      );
    }
    const order = payoffOrder(debts, txs, "avalanche").map((d) => safeName(d.name, "Debt"));
    lines.push(
      `- Recommended payoff focus (avalanche, highest APR first): ${order.join(" → ")}.`,
    );
    const months = projectDebtFreeMonths(debts, txs, "avalanche");
    if (months == null) {
      lines.push(
        "- Projected debt-free date: **not reachable** — current minimum payments don't outpace interest. Flag this.",
      );
    } else if (months === 0) {
      lines.push("- Projected debt-free date: already debt-free.");
    } else {
      lines.push(
        `- Projected debt-free in **${months} month(s)** (~${addMonthsIso(format(now, "yyyy-MM-dd"), months)}) if the same total monthly payment is maintained.`,
      );
    }
  }

  // Data-gap notes.
  const gaps: string[] = [];
  if (budgetState.categories.length === 0) gaps.push("no categories / limits");
  if (periodTx.length === 0) gaps.push("no transactions this period");
  if (budgetState.goals.length === 0) gaps.push("no savings goals");
  if (debts.length === 0) gaps.push("no debts");
  if (gaps.length > 0) {
    lines.push("", `**Data gaps:** ${gaps.join("; ")}. State this where a section depends on missing input; do not fabricate.`);
  }

  return lines;
}

function buildTransactionsSection(
  budgetState: BudgetState,
  fm: (amount: number) => string,
  debts: DebtInput[],
): string[] {
  const periodTx = transactionsInPeriod(budgetState.transactions, budgetState.period);
  if (periodTx.length === 0) {
    return ["## Recent transactions", "No transactions logged this period."];
  }
  const catLookup = new Map(budgetState.categories.map((c) => [c.id, safeName(c.name, "Uncategorized")]));
  const debtLookup = new Map(debts.map((d) => [d.id, safeName(d.name, "Debt")]));
  const goalLookup = new Map(budgetState.goals.map((g) => [g.id, safeName(g.name, "Goal")]));

  const shown = recentTransactionsDescending(periodTx);
  const rows = shown.map((t) => {
    const type = t.type === "income" ? "income" : "expense";
    let label: string;
    if (t.debtId != null) {
      label = `Debt payment${debtLookup.has(t.debtId) ? ` (${debtLookup.get(t.debtId)})` : ""}`;
    } else if (t.goalId != null) {
      label =
        t.type === "income"
          ? `Goal withdrawal${goalLookup.has(t.goalId) ? ` (${goalLookup.get(t.goalId)})` : ""}`
          : `Savings${goalLookup.has(t.goalId) ? ` (${goalLookup.get(t.goalId)})` : ""}`;
    } else {
      label = t.categoryId != null ? catLookup.get(t.categoryId) ?? "Uncategorized" : "Uncategorized";
    }
    const note = safeName(t.note, "—");
    return `- ${isoDay(t.date)} | ${type} | ${fm(t.amount)} | ${label} | ${note}`;
  });

  return [
    "## Recent transactions (audit trail only)",
    `Showing ${shown.length} of ${periodTx.length} transactions (newest first). The totals above are authoritative — do **not** sum these rows.`,
    ...rows,
  ];
}

function buildOutputInstructions(): string[] {
  return [
    "---",
    "",
    "## Response format",
    "",
    "Respond entirely in **Markdown** — use `##`/`###` headings, compact tables and short bullets; keep it visual and scannable. No long paragraphs, no emoji. Use **only** the figures supplied above; never invent or recompute numbers (the %used, forecast, safe-to-spend, status and debt figures are already calculated for you). Where a section needs a figure that isn't provided, say so in one line and continue.",
    "",
    "Produce these eight sections, in order:",
    "",
    "## 1. Financial Snapshot",
    "A compact table: planned income, category spending so far, savings allocations, debt payments, money still available, and total remaining debt. End with one line: overall status (use the supplied **money still available / over-budget** flag).",
    "",
    "## 2. Budget Health",
    "Give a single qualitative verdict — **Good**, **Watch**, or **Needs attention** — justified in one line by the supplied pace status and the count of categories at HIGH/OVER. Then four short reads, each citing a supplied number: **Spending pace** (use the forecast & pace status), **Savings progress** (goals), **Category balance** (how many categories OVER/HIGH), **Debt** (total remaining + projected debt-free). Do not invent a numeric score.",
    "",
    "## 3. Overspending & Risk",
    "A table — **Category | Limit | Spent | % used | Status | Suggested action** — filling Limit/Spent/% used/Status **verbatim** from the per-category health table. Add a practical suggested action per row that is OVER or HIGH.",
    "",
    "## 4. Where the money goes",
    "Optional compact bar chart from the supplied **% used** values (wrap it in a code fence so it aligns); if it won't render cleanly, skip it and rely on the table. Do not divide anything yourself — use the supplied percentages.",
    "",
    "## 5. Rest-of-Period Action Plan",
    "Anchor everything to the supplied **safe-to-spend per day** and (if present) the **daily cut needed to get back on track**. Four short clusters: **Reduce**, **Pause**, **Keep**, **Prioritise**. Treat debt minimums as non-negotiable.",
    "",
    "## 6. Plan for the days left",
    "A short week-by-week plan covering only the **days remaining in this period** (use the supplied count — do not assume four equal weeks or a calendar month). Give each week a spending allowance derived from the supplied safe-to-spend figure.",
    "",
    "## 7. Quick Wins",
    "Two to three immediate actions for this week, one short line each.",
    "",
    "## 8. Final Recommendation",
    "One short, decisive, humane paragraph as my coach — anchored to my supplied numbers and explicitly accounting for my debts and savings goals.",
    "",
    "End with one line — **Assumptions & gaps:** anything you had to assume or could not factor in.",
  ];
}

/**
 * Builds a clipboard-ready AI prompt from live budget state plus debts and the display
 * currency. All money figures are pre-formatted in the workbook's display currency (no FX);
 * `formatMoney` is the currency-aware formatter (e.g. `formatAmount` from the currency context).
 */
export function generateMoneyPlanPrompt(
  budgetState: BudgetState,
  formatMoney: (amount: number) => string,
  inputs?: MoneyPlanInputs,
): string {
  const now = inputs?.now ?? new Date();
  const debts = inputs?.debts ?? [];
  const currencyCode = inputs?.currencyCode;
  // Render a clear sentinel for non-finite values instead of a misleading "0".
  const fm = (amount: number) => (Number.isFinite(amount) ? formatMoney(amount) : "(missing)");

  const constraints: string[] = [
    "Act as a personal finance coach. Be concrete, humane, and decisive.",
    "",
    "### How to use this data",
    "- Use only the figures supplied below. Do not compute, estimate, or invent any number that isn't given.",
  ];
  if (currencyCode) {
    constraints.push(
      `- All amounts are shown in **${currencyCode}** (already formatted). Do not convert currencies or assume USD; keep advice locale-appropriate.`,
    );
  }
  constraints.push(
    "- The per-category %used, the spend forecast, safe-to-spend and debt figures are precomputed — use them verbatim.",
    "- Figures cover the **budget period** shown below, which may not align to a calendar month.",
    "- If something needed is missing, say so in one line and continue. Never fabricate.",
  );

  return [
    ...constraints,
    "",
    "---",
    "",
    ...buildFactsBlock(budgetState, fm, now, debts),
    "",
    ...buildTransactionsSection(budgetState, fm, debts),
    "",
    "---",
    "",
    "**Your assignment:** Produce a structured, visual Markdown money plan for me.",
    "",
    ...buildOutputInstructions(),
  ].join("\n");
}
