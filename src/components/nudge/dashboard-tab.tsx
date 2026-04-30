"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import { Badge, Button, Card, Heading, Text } from "frosted-ui";
import { AddTransactionDialog } from "@/components/nudge/add-transaction-dialog";
import { AiMoneyPlanCta } from "@/components/nudge/dashboard/ai-money-plan-cta";
import { CategoryHealthList } from "@/components/nudge/dashboard/category-health-list";
import { OverviewHero } from "@/components/nudge/dashboard/overview-hero";
import { useCurrency } from "@/context/currency-context";
import { useNudgeBudget } from "@/context/nudge-budget-context";
import { computeMonthlySpendingVelocity } from "@/lib/budget/velocity";
import {
  sumExpenses,
  sumIncome,
  transactionsThisMonth,
} from "@/lib/budget/selectors";

export function DashboardTab() {
  const { state } = useNudgeBudget();
  const c = useCurrency();
  const fmt = c.formatFromUsd;
  const monthTx = useMemo(
    () => transactionsThisMonth(state.transactions, new Date()),
    [state.transactions],
  );
  const income = useMemo(() => sumIncome(monthTx), [monthTx]);
  const spent = useMemo(() => sumExpenses(monthTx), [monthTx]);
  const net = income - spent;

  const v = useMemo(
    () => computeMonthlySpendingVelocity(state.transactions, state.categories),
    [state.transactions, state.categories],
  );

  const forecastDisplay =
    v.hasBudget && v.hasExpenseData ? fmt(v.forecast) : "—";

  return (
    <div className="flex flex-col space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Badge color="gold" size="1" className="font-medium">
            {format(new Date(), "MMMM yyyy", { locale: enUS })}
          </Badge>
          <Heading size="7" className="mt-3 tracking-tight">
            Stay on track
          </Heading>
          <Text size="3" color="gray" className="mt-2 max-w-md leading-relaxed">
            See what&apos;s left and where to focus.
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
      </header>

      {state.transactions.length === 0 ? (
        <Card size="3" variant="surface" className="nudge-card-surface border border-dashed border-gray-600/25 p-5">
          <Text size="2" color="gray" className="leading-relaxed">
            No activity yet. Log your first expense with{" "}
            <span className="font-medium text-foreground/90">Add transaction</span> to populate this
            overview.
          </Text>
        </Card>
      ) : null}

      {state.transactions.length > 0 && monthTx.length === 0 ? (
        <Text size="2" color="gray" className="leading-relaxed">
          Nothing dated in {format(new Date(), "MMMM yyyy", { locale: enUS })}. Check{" "}
          <span className="font-medium text-foreground/90">Activity</span> or add a transaction for
          this month.
        </Text>
      ) : null}

      <OverviewHero />

      <section aria-label="This month summary">
        <Heading size="3" className="mb-3 tracking-tight text-foreground/90">
          This month
        </Heading>
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          <QuickStat label="Income" value={fmt(income)} />
          <QuickStat label="Spending" value={fmt(spent)} />
          <QuickStat
            label="Net"
            value={fmt(net)}
            valueClass={net >= 0 ? undefined : "text-ruby-600 dark:text-ruby-400"}
          />
          <QuickStat label="Forecast" value={forecastDisplay} hint="Month-end at today's pace" />
        </div>
      </section>

      <section aria-label="Category health">
        <CategoryHealthList />
      </section>
    </div>
  );
}

function QuickStat(props: {
  label: string;
  value: string;
  hint?: string;
  valueClass?: string;
}) {
  return (
    <Card
      size="3"
      variant="surface"
      className="nudge-card-surface flex h-full min-h-0 w-full min-w-0 flex-col p-4 sm:p-5"
    >
      <div className="flex w-full min-w-0 flex-1 flex-col gap-2">
        <Text size="2" color="gray" className="m-0 block w-full font-medium leading-snug">
          {props.label}
        </Text>
        <Text
          size="5"
          weight="medium"
          className={`m-0 block w-full min-w-0 wrap-break-word tabular-nums leading-tight tracking-tight ${props.valueClass ?? ""}`}
        >
          {props.value}
        </Text>
      </div>
      <div className="mt-3 w-full min-h-11 shrink-0">
        {props.hint ? (
          <Text size="1" color="gray" className="m-0 block w-full leading-snug">
            {props.hint}
          </Text>
        ) : null}
      </div>
    </Card>
  );
}
