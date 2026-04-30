"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import { Card, Heading, Progress, Text } from "frosted-ui";
import { CategoryPie, WeekBarChart } from "@/components/nudge/charts";
import { SpendingVelocityCard } from "@/components/nudge/dashboard/spending-velocity-card";
import { useCurrency } from "@/context/currency-context";
import { useNudgeBudget } from "@/context/nudge-budget-context";
import {
  categorySpendThisMonth,
  dailySpendingLastWeek,
  spendingByCategory,
  transactionsThisMonth,
} from "@/lib/budget/selectors";

export function InsightsTab() {
  const { state } = useNudgeBudget();
  const c = useCurrency();
  const fmt = c.formatFromUsd;
  const monthTx = useMemo(
    () => transactionsThisMonth(state.transactions, new Date()),
    [state.transactions],
  );
  const pie = useMemo(
    () => spendingByCategory(monthTx, state.categories),
    [monthTx, state.categories],
  );
  const weekBars = useMemo(
    () => dailySpendingLastWeek(state.transactions),
    [state.transactions],
  );

  return (
    <div className="flex flex-col space-y-8">
      <header className="min-w-0">
        <Heading size="6" className="tracking-tight">
          Insights
        </Heading>
        <Text size="2" color="gray" className="mt-2 max-w-prose leading-relaxed">
          Charts, pace, and category breakdown for {format(new Date(), "MMMM yyyy", { locale: enUS })}.
        </Text>
      </header>

      <SpendingVelocityCard />

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Card size="3" variant="surface" className="nudge-card-surface min-w-0 p-4 sm:p-5">
          <Heading size="4" className="mb-1 tracking-tight">
            Spending by category
          </Heading>
          <Text size="2" color="gray" className="mb-2 leading-relaxed">
            Where money went this month
          </Text>
          {c.currency !== "USD" ? (
            <Text size="1" color="gray" className="mb-4 leading-snug">
              Chart uses USD internally; overview uses {c.currency}.
            </Text>
          ) : (
            <div className="mb-6" />
          )}
          <CategoryPie data={pie} />
        </Card>
        <Card size="3" variant="surface" className="nudge-card-surface min-w-0 p-4 sm:p-5">
          <Heading size="4" className="mb-1 tracking-tight">
            Last 7 days
          </Heading>
          <Text size="2" color="gray" className="mb-2 leading-relaxed">
            Daily expense totals
          </Text>
          {c.currency !== "USD" ? (
            <Text size="1" color="gray" className="mb-4 leading-snug">
              Bars follow stored USD; axis uses {c.currency}.
            </Text>
          ) : (
            <div className="mb-6" />
          )}
          <WeekBarChart data={weekBars} />
        </Card>
      </div>

      <Card size="3" variant="classic" className="nudge-card-surface p-4 sm:p-5">
        <Heading size="4" className="mb-5 pb-2 tracking-tight">
          By category
        </Heading>
        {state.categories.length === 0 ? (
          <Text size="2" color="gray" className="leading-relaxed">
            Add categories under Budgets to see a detailed breakdown.
          </Text>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            {state.categories.map((cat) => {
              const used = categorySpendThisMonth(cat.id, state.transactions, new Date());
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
        )}
      </Card>
    </div>
  );
}
