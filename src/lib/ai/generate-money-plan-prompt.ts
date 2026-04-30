import { format, parseISO } from "date-fns";
import type { BudgetState } from "@/lib/budget/types";
import {
  categorySpendThisMonth,
  goalDisplaySaved,
  sumExpenses,
  sumIncome,
  totalGoalsSavedUsd,
  transactionsThisMonth,
} from "@/lib/budget/selectors";

const TX_CAP = 20;

function stableGoalNames(goals: BudgetState["goals"]): Map<string, string> {
  const m = new Map<string, string>();
  for (const g of goals) {
    const name =
      typeof g.name === "string" && g.name.trim().length > 0 ? g.name.trim() : "Goal";
    m.set(g.id, name);
  }
  return m;
}

function stableCategoryNames(categories: BudgetState["categories"]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of categories) {
    const name =
      typeof c.name === "string" && c.name.trim().length > 0 ? c.name.trim() : "Uncategorized";
    m.set(c.id, name);
  }
  return m;
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

function buildDerivedContext(
  budgetState: BudgetState,
  fm: (usd: number) => string,
  now: Date,
): string[] {
  const monthTx = transactionsThisMonth(budgetState.transactions, now);
  const monthExpenses = sumExpenses(monthTx);
  const monthIncomeLogged = sumIncome(monthTx);
  const totalPlannedLimits = budgetState.categories.reduce(
    (s, c) => s + (Number.isFinite(c.budgetLimit) ? Math.max(0, c.budgetLimit) : 0),
    0,
  );
  const remainingVsIncomePlan = Number.isFinite(budgetState.incomePlan)
    ? budgetState.incomePlan - monthExpenses
    : NaN;

  let goalsSummaryLine: string;
  if (budgetState.goals.length === 0) {
    goalsSummaryLine = "(No savings goals recorded.)";
  } else {
    const sumTarget = budgetState.goals.reduce(
      (s, g) => s + (Number.isFinite(g.targetAmount) ? Math.max(0, g.targetAmount) : 0),
      0,
    );
    const sumSaved = totalGoalsSavedUsd(budgetState.goals, budgetState.transactions);
    goalsSummaryLine = `${budgetState.goals.length} goal(s); aggregate targets ${fm(sumTarget)}, aggregate saved ${fm(sumSaved)} (see Goals for per-goal breakdown).`;
  }

  const monthLabel = format(now, "MMMM yyyy");
  const refDay = format(now, "yyyy-MM-dd");

  const derived: string[] = [
    "## Derived totals (use these for tables and scorecards; do not fabricate)",
    `- Reference calendar month for transaction rollups: **${monthLabel}**`,
    `- As-of calendar date context: ${refDay}`,
    `- Planned monthly income (user target): ${fm(budgetState.incomePlan)}`,
    `- Sum of category spending limits (planned bucket capacity): ${fm(totalPlannedLimits)}`,
    `- Month-to-date logged expenses (${monthLabel}): ${fm(monthExpenses)}`,
    `- Month-to-date logged income (${monthLabel}): ${fm(monthIncomeLogged)}`,
    `- Remaining (planned income minus month-to-date logged expenses): ${Number.isFinite(remainingVsIncomePlan) ? fm(remainingVsIncomePlan) : "Not derivable — missing numeric data"}`,
    `- Savings summary: ${goalsSummaryLine}`,
    "",
    "**Per-category: limit vs spending this calendar month:**",
    budgetState.categories.length === 0
      ? "(No categories — category-level comparisons unavailable.)"
      : budgetState.categories
          .map((c) => {
            const label =
              typeof c.name === "string" && c.name.trim().length > 0 ? c.name.trim() : "Uncategorized";
            const spent = categorySpendThisMonth(c.id, budgetState.transactions, now);
            const limit = Number.isFinite(c.budgetLimit) ? c.budgetLimit : 0;
            const delta = spent - limit;
            return `- **${label}** — limit ${fm(limit)}, month spend ${fm(spent)}, variance ${delta >= 0 ? "+" : ""}${fm(delta)}`;
          })
          .join("\n"),
  ];

  const dataGaps: string[] = [];
  if (budgetState.categories.length === 0) dataGaps.push("no categories / limits defined");
  if (budgetState.transactions.length === 0) dataGaps.push("no logged transactions");
  if (budgetState.goals.length === 0) dataGaps.push("no savings goals");
  if (dataGaps.length > 0) {
    derived.push(
      "",
      "**Data gaps (state explicitly wherever a section depends on missing input):**",
      `- Missing or thin: ${dataGaps.join("; ")}. Continue with what's available.`,
    );
  }

  return derived;
}

function buildOutputInstructions(): string[] {
  return [
    "---",
    "",
    "## Response format requirements",
    "",
    `Respond entirely in **Markdown**. Use **## / ### headings**, **tables**, short bullets, and tight lines — make the reply **visual and scannable**. Prefer tables and scorecards over prose. Avoid long paragraphs. Do **not** use emoji unless they clearly improve readability. Do **not** mention or imply external tools or databases. Never invent figures; use only facts from my payload and computed blocks. If evidence is insufficient, label what is missing and continue.`,
    "",
    "Use exactly these **numbered section titles as ## headings**, in **this order** (include all eight):",
    "",
    "## 1. Financial Snapshot",
    "",
    "- A **summary Markdown table**: columns sensible for the rows below (keep it compact):",
    "  - Monthly income (my planned monthly income)",
    "  - Total planned spending (sum of category limits, or explicitly **not available**)",
    "  - Total tracked spending — use **month-to-date logged expenses** from derived totals above",
    "  - Remaining money (derived **remaining** row, only if arithmetic is supported)",
    "  - Savings progress (from Goals + derived aggregate; if no goals, state **not tracked**)",
    "  - **Financial status**: exactly one label — **Good**, **Warning**, or **Needs Attention** — plus one short justification referencing my numbers",
    "",
    "## 2. Budget Health Score",
    "",
    "- Headline score **out of 100** (scorecard-style, bold the number).",
    "- Four line items (sub-scores contributing to the headline): **Spending control** | **Savings consistency** | **Category balance** | **Cash flow safety** — each with a **numeric sub-score / weighting** explained in one sentence tied to **my data**.",
    "",
    "## 3. Overspending & Risk Areas",
    "",
    "- One **Markdown table** with columns: **Category** | **Current limit** | **Actual spending** | **Difference** | **Risk level** | **Suggested action**",
    "- Fill rows from **per-category variance** plus context; omit invented categories. If my list is missing, write a minimal row explaining insufficient structure.",
    "",
    "## 4. Visual Budget Breakdown",
    "",
    "- ASCII / Unicode block-bar **infographic**, left-aligned labels, comparable bar width:",
    "",
    "```",
    "Food               ███████░░░ 70%",
    "Transport          ████░░░░░░ 40%",
    "Subscriptions      █████████░ 90%",
    "```",
    "",
    "- Derive percentages from **month spend vs category limit ratio** whenever both sides exist (cap at 100% if over limit unless you annotate overage). Omit categories outside my limits list.",
    "",
    "## 5. Rest-of-Month Action Plan",
    "",
    "Four labeled bullet clusters (short bullets only):",
    "- **What to reduce** …",
    "- **What to pause** …",
    "- **What to keep** …",
    "- **What to prioritise** …",
    "",
    "## 6. Weekly Money Plan",
    "",
    "Four headings in order:",
    "- **Week 1** …",
    "- **Week 2** …",
    "- **Week 3** …",
    "- **Week 4** …",
    "",
    "## 7. Quick Wins",
    "",
    "**Exactly three** bullets — immediate actions doable this week, one short line each.",
    "",
    "## 8. Final Recommendation",
    "",
    "Closing: one short practical paragraph written as my coach — decisive, humane, anchored to my supplied numbers.",
  ];
}

/**
 * Builds a clipboard-ready AI prompt from live budget state.
 * `formatMoney` should convert canonical USD amounts to the user's display formatting.
 */
export function generateMoneyPlanPrompt(
  budgetState: BudgetState,
  formatMoney: (usd: number) => string,
): string {
  const fm = (usd: number) => formatMoney(Number.isFinite(usd) ? usd : 0);
  const income = fm(budgetState.incomePlan);
  const now = new Date();

  const catLines =
    budgetState.categories.length === 0
      ? "- No categories defined"
      : budgetState.categories
          .map((c) => {
            const label =
              typeof c.name === "string" && c.name.trim().length > 0 ? c.name.trim() : "Uncategorized";
            return `- ${label}: ${fm(c.budgetLimit)}`;
          })
          .join("\n");

  const catLookup = stableCategoryNames(budgetState.categories);
  const goalLookup = stableGoalNames(budgetState.goals);
  let txSection: string;
  if (budgetState.transactions.length === 0) {
    txSection = "No transactions available";
  } else {
    txSection = recentTransactionsDescending(budgetState.transactions)
      .map((t) => {
        let dateDisplay = t.date;
        try {
          dateDisplay = format(parseISO(t.date), "yyyy-MM-dd");
        } catch {
          /* keep raw */
        }
        const catId = t.categoryId;
        const categoryLabel =
          t.type === "expense" && t.goalId != null
            ? "Savings goals"
            : t.type === "income" && t.goalId != null
              ? "Goal withdrawal"
              : catId != null
                ? (catLookup.get(catId) ?? "Uncategorized")
                : "Uncategorized";
        const note =
          typeof t.note === "string" && t.note.trim().length > 0 ? t.note.trim() : "—";
        const ty = t.type === "income" || t.type === "expense" ? t.type : "expense";
        const gid = t.goalId;
        const goalTag =
          gid != null ? ` | goal: ${goalLookup.get(gid) ?? "linked"}` : "";
        return `- ${dateDisplay} | ${ty} | ${fm(t.amount)} | ${categoryLabel}${goalTag} | ${note}`;
      })
      .join("\n");
  }

  let goalsSection: string;
  if (budgetState.goals.length === 0) {
    goalsSection = "No goals set";
  } else {
    goalsSection = budgetState.goals
      .map((g) => {
        const name =
          typeof g.name === "string" && g.name.trim().length > 0 ? g.name.trim() : "Goal";
        const saved = goalDisplaySaved(g, budgetState.transactions);
        let progress = `saved ${fm(saved)}`;
        if (
          g.targetAmount > 0 &&
          Number.isFinite(saved) &&
          Number.isFinite(g.targetAmount)
        ) {
          const pct = Math.round((100 * Math.max(0, saved)) / g.targetAmount);
          progress += ` (${Math.min(100, pct)}% toward target)`;
        }
        let line = `- ${name}: target ${fm(g.targetAmount)}, ${progress}`;
        if (g.deadline != null && g.deadline.trim().length > 0) {
          let dv = g.deadline.trim();
          try {
            dv = format(parseISO(g.deadline), "yyyy-MM-dd");
          } catch {
            /* keep raw */
          }
          line += `; deadline ${dv}`;
        }
        return line;
      })
      .join("\n");
  }

  const derivedBlock = buildDerivedContext(budgetState, fm, now).join("\n");
  const outputBlock = buildOutputInstructions().join("\n");

  return [
    "Act as a personal finance coach for a solopreneur.",
    "",
    "### My financial data (facts only)",
    "",
    "**Monthly Income Plan:**",
    income,
    "",
    "**Spending Categories (limits):**",
    catLines,
    "",
    "**Recent transactions (latest up to ~20 rows, newest first — use for audit trail, not as sole substitute for derived month totals unless noted):**",
    txSection,
    "",
    "**Savings Goals:**",
    goalsSection,
    "",
    derivedBlock,
    "",
    "---",
    "",
    "**Your assignment:** Produce a structured, visual Markdown money plan for me.",
    "",
    outputBlock,
  ].join("\n");
}
