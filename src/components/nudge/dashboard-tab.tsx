"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import { Badge, Button, Card, Heading, Progress, Text, TextField } from "frosted-ui";
import { CategoryPie, WeekBarChart } from "@/components/nudge/charts";
import { AddTransactionDialog } from "@/components/nudge/add-transaction-dialog";
import { AiMoneyPlanCta } from "@/components/nudge/dashboard/ai-money-plan-cta";
import { CategoryHealthList } from "@/components/nudge/dashboard/category-health-list";
import { MonthlyRemainingCard } from "@/components/nudge/dashboard/monthly-remaining-card";
import { SpendingVelocityCard } from "@/components/nudge/dashboard/spending-velocity-card";
import { useCurrency } from "@/context/currency-context";
import { useNudgeBudget } from "@/context/nudge-budget-context";
import {
  categorySpendThisMonth,
  dailySpendingLastWeek,
  goalDisplaySaved,
  overallSavingsProgress,
  spendingByCategory,
  sumExpenses,
  sumIncome,
  totalGoalsSavedUsd,
  totalGoalsTargetUsd,
  transactionsThisMonth,
} from "@/lib/budget/selectors";

export function DashboardTab() {
  const { state, setIncomePlan } = useNudgeBudget();
  const c = useCurrency();
  const fmt = c.formatFromUsd;
  const [incomeDraft, setIncomeDraft] = useState("");

  useEffect(() => {
    setIncomeDraft(String(c.usdAsDisplayAmount(state.incomePlan)));
  }, [c.currency, state.incomePlan, c.usdAsDisplayAmount]);

  const now = new Date();
  const monthTx = useMemo(
    () => transactionsThisMonth(state.transactions, new Date()),
    [state.transactions],
  );
  const income = useMemo(() => sumIncome(monthTx), [monthTx]);
  const spent = useMemo(() => sumExpenses(monthTx), [monthTx]);
  const net = income - spent;
  const pie = useMemo(
    () => spendingByCategory(monthTx, state.categories),
    [monthTx, state.categories],
  );
  const weekBars = useMemo(
    () => dailySpendingLastWeek(state.transactions),
    [state.transactions],
  );

  const totalBudget = state.categories.reduce((s, cat) => s + cat.budgetLimit, 0);
  const budgetUsedRatio =
    totalBudget > 0 ? Math.min(1, spent / totalBudget) : spent > 0 ? 1 : 0;

  const planDelta = state.incomePlan - spent;

  const goalsTargetTotal = useMemo(() => totalGoalsTargetUsd(state.goals), [state.goals]);
  const goalsSavedTotal = useMemo(
    () => totalGoalsSavedUsd(state.goals, state.transactions),
    [state.goals, state.transactions],
  );
  const savingsOverallPct = useMemo(
    () => overallSavingsProgress(state.goals, state.transactions),
    [state.goals, state.transactions],
  );

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Badge color="gold" size="1" className="font-medium">
            {format(now, "MMMM yyyy", { locale: enUS })}
          </Badge>
          <Heading size="7" className="mt-3 tracking-tight">
            Stay on track
          </Heading>
          <Text size="3" color="gray" className="mt-2 max-w-xl leading-relaxed">
            Cash flow, categories, and how much room you have left.
          </Text>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
          <AiMoneyPlanCta />
          <AddTransactionDialog
            trigger={
              <Button
                size="3"
                color="gold"
                className="w-full shadow-sm sm:w-auto"
                aria-label="Add income or expense"
              >
                Add transaction
              </Button>
            }
          />
        </div>
      </div>

      <MonthlyRemainingCard />

      {state.transactions.length > 0 && monthTx.length === 0 ? (
        <Text size="2" color="gray" className="leading-relaxed">
          None of your {state.transactions.length} logged{" "}
          {state.transactions.length === 1 ? "entry is" : "entries are"} dated in{" "}
          {format(now, "MMMM yyyy", { locale: enUS })}. Open the Activity tab to see them, or add a
          transaction dated this month for it to appear in the overview.
        </Text>
      ) : null}

      <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Income" value={fmt(income)} hint="Recorded this month" tone="positive" />
        <StatCard label="Spending" value={fmt(spent)} hint="Outflows this month" tone="neutral" />
        <StatCard
          label="Net"
          value={fmt(net)}
          hint="Income minus spending"
          tone={net >= 0 ? "positive" : "warning"}
        />
        <StatCard
          label="Room vs plan"
          value={fmt(planDelta)}
          hint={`Plan: ${fmt(state.incomePlan)} / month`}
          tone={planDelta >= 0 ? "positive" : "warning"}
        />
      </div>

      <CategoryHealthList />

      <SpendingVelocityCard />

      {state.goals.length > 0 ? (
        <Card size="3" variant="classic" className="nudge-card-surface">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <Heading size="4" className="tracking-tight">
                Savings goals
              </Heading>
              <div className="mt-5 space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                  <Text size="2" weight="medium">
                    Overall
                  </Text>
                  <Text size="2" color="gray" className="min-w-0 text-right tabular-nums">
                    {fmt(goalsSavedTotal)} / {fmt(goalsTargetTotal)}
                  </Text>
                </div>
                <Progress value={savingsOverallPct * 100} color="gold" />
              </div>
            </div>
            <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
              {state.goals.map((g) => {
                const saved = goalDisplaySaved(g, state.transactions);
                const pct =
                  g.targetAmount > 0 ? Math.min(100, (saved / g.targetAmount) * 100) : 0;
                return (
                  <div
                    key={g.id}
                    className="rounded-2xl border border-gray-600/15 bg-gray-900/4 p-4 dark:bg-white/4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Text weight="medium" className="min-w-0 flex-1 truncate leading-snug">
                        {g.name}
                      </Text>
                      <Text size="2" color="gray" className="shrink-0 tabular-nums">
                        {Math.round(pct)}%
                      </Text>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between gap-4">
                      <Text size="2" color="gray" className="shrink-0">
                        Saved
                      </Text>
                      <Text size="2" weight="medium" className="min-w-0 text-right tabular-nums">
                        {fmt(saved)} / {fmt(g.targetAmount)}
                      </Text>
                    </div>
                    <div className="mt-3">
                      <Progress value={pct} color="gold" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      ) : null}

      <Card size="3" variant="surface" className="nudge-card-surface">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <Heading size="4" className="tracking-tight">
              Monthly income plan
            </Heading>
            <Text size="2" color="gray" className="mt-2 leading-relaxed">
              Expected cash in for the month—separate from transactions you log.
            </Text>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
            <label className="sr-only" htmlFor="income-plan-input">
              Monthly income {c.amountApproxLabel}
            </label>
            <TextField.Root className="nudge-field w-full min-w-0 sm:max-w-44">
              <TextField.Input
                id="income-plan-input"
                type="number"
                inputMode="decimal"
                min={0}
                step={c.currency === "JPY" ? 1 : "any"}
                autoComplete="off"
                disabled={c.currency !== "USD" && c.rateLoading}
                value={incomeDraft}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIncomeDraft(e.target.value)}
                onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                  const n = Number.parseFloat(e.target.value);
                  if (!Number.isFinite(n) || n < 0) {
                    setIncomeDraft(String(c.usdAsDisplayAmount(state.incomePlan)));
                    return;
                  }
                  const usd = c.displayAmountAsUsd(n);
                  setIncomePlan(usd);
                  setIncomeDraft(String(c.usdAsDisplayAmount(usd)));
                }}
              />
            </TextField.Root>
            <Text size="2" color="gray" className="shrink-0 pt-0.5 sm:pt-0">
              {c.currency === "USD" ? "USD" : c.currency} / mo
            </Text>
          </div>
        </div>
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <Text size="2" weight="medium">
              Budget usage
            </Text>
            <Text size="2" color="gray" className="min-w-0 text-right">
              {Math.round(budgetUsedRatio * 100)}% of category limits
            </Text>
          </div>
          <Progress value={budgetUsedRatio * 100} color="gold" />
        </div>
      </Card>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Card size="3" variant="surface" className="nudge-card-surface min-w-0">
          <Heading size="4" className="mb-1 tracking-tight">
            Spending by category
          </Heading>
          <Text size="2" color="gray" className="mb-2 leading-relaxed">
            Where money went {format(now, "MMMM yyyy", { locale: enUS })}
          </Text>
          {c.currency !== "USD" ? (
            <Text size="1" color="gray" className="mb-4 leading-snug">
              Chart values are shown in USD (canonical); numbers above use {c.currency}.
            </Text>
          ) : (
            <div className="mb-6" />
          )}
          <CategoryPie data={pie} />
        </Card>
        <Card size="3" variant="surface" className="nudge-card-surface min-w-0">
          <Heading size="4" className="mb-1 tracking-tight">
            Last 7 days
          </Heading>
          <Text size="2" color="gray" className="mb-2 leading-relaxed">
            Daily expense totals
          </Text>
          {c.currency !== "USD" ? (
            <Text size="1" color="gray" className="mb-4 leading-snug">
              Bar heights follow stored USD equivalents; axis and hover show {c.currency}.
            </Text>
          ) : (
            <div className="mb-6" />
          )}
          <WeekBarChart data={weekBars} />
        </Card>
      </div>

      <Card size="3" variant="classic" className="nudge-card-surface">
        <Heading size="4" className="mb-5 pb-2 tracking-tight">
          By category
        </Heading>
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          {state.categories.map((cat) => {
            const used = categorySpendThisMonth(cat.id, state.transactions, now);
            const pct = cat.budgetLimit > 0 ? Math.min(100, (used / cat.budgetLimit) * 100) : 0;
            return (
              <div
                key={cat.id}
                className="rounded-2xl border border-gray-600/15 bg-gray-900/4 p-4 dark:bg-white/4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: cat.color }}
                      aria-hidden
                    />
                    <Text weight="medium" className="min-w-0 truncate">
                      {cat.name}
                    </Text>
                  </div>
                  <Text
                    size="2"
                    color="gray"
                    className="w-full shrink-0 tabular-nums text-right sm:w-auto sm:pt-0.5"
                  >
                    {fmt(used)} / {fmt(cat.budgetLimit)}
                  </Text>
                </div>
                <div className="mt-3">
                  <Progress value={pct} color={pct > 95 ? "ruby" : "gold"} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function StatCard(props: {
  label: string;
  value: string;
  hint: string;
  tone: "positive" | "neutral" | "warning";
}) {
  const ring =
    props.tone === "positive"
      ? "ring-1 ring-emerald-500/20"
      : props.tone === "warning"
        ? "ring-1 ring-amber-500/25"
        : "ring-1 ring-gray-500/15";
  return (
    <Card size="3" variant="surface" className={`nudge-card-surface nudge-card-frosted ${ring}`}>
      <Text size="2" color="gray" className="font-medium">
        {props.label}
      </Text>
      <Heading size="5" className="mt-3 min-w-0 wrap-break-word tabular-nums tracking-tight">
        {props.value}
      </Heading>
      <Text size="1" color="gray" className="mt-3 leading-relaxed">
        {props.hint}
      </Text>
    </Card>
  );
}
