"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { Badge, Button, Card, Heading, Progress, Text, TextField } from "frosted-ui";
import { CategoryPie, WeekBarChart } from "@/components/nudge/charts";
import { AddTransactionDialog } from "@/components/nudge/add-transaction-dialog";
import { useNudgeBudget } from "@/context/nudge-budget-context";
import {
  categorySpendThisMonth,
  dailySpendingLastWeek,
  spendingByCategory,
  sumExpenses,
  sumIncome,
  transactionsThisMonth,
} from "@/lib/budget/selectors";

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);

export function DashboardTab() {
  const { state, setIncomePlan, resetDemo } = useNudgeBudget();
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

  const totalBudget = state.categories.reduce((s, c) => s + c.budgetLimit, 0);
  const budgetUsedRatio =
    totalBudget > 0 ? Math.min(1, spent / totalBudget) : spent > 0 ? 1 : 0;

  const planDelta = state.incomePlan - spent;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge color="jade">This month</Badge>
          <Heading size="7" className="mt-2">
            Stay on track
          </Heading>
          <Text size="3" color="gray" className="mt-1 max-w-xl">
            Nudge surfaces the numbers that matter—cash flow, category mix, and a gentle view
            of how much room you still have.
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <AddTransactionDialog trigger={<Button size="2">Add transaction</Button>} />
          <Button size="2" variant="soft" color="gray" onClick={resetDemo}>
            Load demo data
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Income" value={money(income)} hint="Recorded this month" tone="positive" />
        <StatCard label="Spending" value={money(spent)} hint="Outflows this month" tone="neutral" />
        <StatCard
          label="Net"
          value={money(net)}
          hint="Income minus spending"
          tone={net >= 0 ? "positive" : "warning"}
        />
        <StatCard
          label="Room vs plan"
          value={money(planDelta)}
          hint={`Plan: ${money(state.incomePlan)} / month`}
          tone={planDelta >= 0 ? "positive" : "warning"}
        />
      </div>

      <Card size="3" variant="surface">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Heading size="4">Monthly income plan</Heading>
            <Text size="2" color="gray" className="mt-1">
              A simple anchor for what you expect to bring in—separate from logged paychecks.
            </Text>
          </div>
          <div className="flex items-center gap-2">
            <TextField.Root style={{ width: 120 }}>
              <TextField.Input
                type="number"
                value={String(state.incomePlan)}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setIncomePlan(Number.parseFloat(e.target.value) || 0)
                }
              />
            </TextField.Root>
            <Text size="2" color="gray">
              USD
            </Text>
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-2 flex justify-between">
            <Text size="2" weight="medium">
              Budget usage (categories)
            </Text>
            <Text size="2" color="gray">
              {Math.round(budgetUsedRatio * 100)}% of combined limits
            </Text>
          </div>
          <Progress value={budgetUsedRatio * 100} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card size="3" variant="surface">
          <Heading size="4" className="mb-1">
            Spending by category
          </Heading>
          <Text size="2" color="gray" className="mb-4">
            Where money went {format(now, "MMMM yyyy")}
          </Text>
          <CategoryPie data={pie} />
        </Card>
        <Card size="3" variant="surface">
          <Heading size="4" className="mb-1">
            Last 7 days
          </Heading>
          <Text size="2" color="gray" className="mb-4">
            Daily expense totals
          </Text>
          <WeekBarChart data={weekBars} />
        </Card>
      </div>

      <Card size="3" variant="classic">
        <Heading size="4" className="mb-4">
          Category pulse
        </Heading>
        <div className="grid gap-4 sm:grid-cols-2">
          {state.categories.map((c) => {
            const used = categorySpendThisMonth(c.id, state.transactions, now);
            const pct = c.budgetLimit > 0 ? Math.min(100, (used / c.budgetLimit) * 100) : 0;
            return (
              <div
                key={c.id}
                className="rounded-xl border border-gray-600/20 bg-gray-900/5 p-4 dark:bg-white/5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    <Text weight="medium">{c.name}</Text>
                  </div>
                  <Text size="2" color="gray">
                    {money(used)} / {money(c.budgetLimit)}
                  </Text>
                </div>
                <div className="mt-3">
                  <Progress value={pct} color={pct > 95 ? "ruby" : "jade"} />
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
  const border =
    props.tone === "positive"
      ? "border-emerald-500/25"
      : props.tone === "warning"
        ? "border-amber-500/30"
        : "border-gray-500/20";
  return (
    <Card size="3" variant="surface" className={`border ${border}`}>
      <Text size="2" color="gray">
        {props.label}
      </Text>
      <Heading size="5" className="mt-1">
        {props.value}
      </Heading>
      <Text size="1" color="gray" className="mt-2">
        {props.hint}
      </Text>
    </Card>
  );
}
