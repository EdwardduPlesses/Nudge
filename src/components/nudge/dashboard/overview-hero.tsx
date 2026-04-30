"use client";

import { useMemo } from "react";
import { Badge, Card, Heading, Text } from "frosted-ui";
import { useCurrency } from "@/context/currency-context";
import { useNudgeBudget } from "@/context/nudge-budget-context";
import { computeMonthlyRemaining } from "@/lib/budget/monthly-remaining";
import { computeMonthlySpendingVelocity } from "@/lib/budget/velocity";

function SupportStat(props: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Text size="2" color="gray" className="font-medium leading-snug">
        {props.label}
      </Text>
      <Text size="3" weight="medium" className="min-w-0 tabular-nums leading-snug">
        {props.value}
      </Text>
    </div>
  );
}

export function OverviewHero() {
  const { state } = useNudgeBudget();
  const { formatFromUsd } = useCurrency();

  const snap = useMemo(() => computeMonthlyRemaining(state, new Date()), [state]);
  const v = useMemo(
    () => computeMonthlySpendingVelocity(state.transactions, state.categories),
    [state.transactions, state.categories],
  );

  const ring =
    snap.needsIncomePlan || (!snap.isOverBudget && snap.availableThisMonthUsd >= 0)
      ? snap.needsIncomePlan
        ? "ring-1 ring-gray-500/15"
        : "ring-1 ring-emerald-500/20"
      : "ring-1 ring-ruby-500/22";

  const pctLine =
    snap.remainingPercent != null ? `${Math.round(snap.remainingPercent)}% remaining` : "—";
  const remainingSecondary = snap.needsIncomePlan ? "—" : pctLine;

  const insightLine = useMemo(() => {
    if (v.hasBudget && v.hasExpenseData && v.insight != null) {
      if (v.insight.kind === "on_track") {
        return "You are on track.";
      }
      if (v.insight.kind === "exceed_by") {
        return `You may overspend by ${formatFromUsd(v.insight.overAmountUsd)}.`;
      }
      if (v.insight.kind === "reduce_daily") {
        return `Reduce daily spending by ${formatFromUsd(v.insight.reductionUsd)}.`;
      }
    }
    if (v.hasBudget && !v.hasExpenseData) {
      return "No spending logged yet this month.";
    }
    if (!v.hasBudget && state.categories.length === 0) {
      return "Add budget categories to track spending limits.";
    }
    if (!v.hasBudget) {
      return "Set category limits under Budgets to see spending pace.";
    }
    return null;
  }, [formatFromUsd, v.hasBudget, v.hasExpenseData, v.insight, state.categories.length]);

  const showSafeToSpend =
    v.hasBudget &&
    v.hasExpenseData &&
    v.safeDailyUsd != null &&
    Number.isFinite(v.safeDailyUsd) &&
    v.safeDailyUsd > 0;

  return (
    <Card size="3" variant="surface" className={`nudge-card-surface nudge-card-frosted ${ring}`}>
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
        <div className="min-w-0 flex-1">
          <Badge color="gold" size="1" className="font-medium">
            Left this month
          </Badge>
          {snap.needsIncomePlan ? (
            <>
              <Heading
                size="7"
                className="mt-4 min-w-0 tracking-tight text-gray-950 dark:text-white"
              >
                Set monthly income
              </Heading>
              <Text size="3" color="gray" className="mt-2 leading-relaxed">
                Add your plan under{" "}
                <span className="font-medium text-foreground/90">Budgets</span> to see what&apos;s
                left.
              </Text>
            </>
          ) : snap.isOverBudget ? (
            <div className="mt-4 flex min-w-0 flex-col gap-2">
              <Text size="2" weight="medium" color="ruby" className="uppercase tracking-wide">
                Over by
              </Text>
              <p className="text-5xl font-semibold tracking-tight wrap-break-word tabular-nums text-ruby-600 sm:text-6xl dark:text-ruby-400">
                {formatFromUsd(Math.abs(snap.availableThisMonthUsd))}
              </p>
              <Text size="3" color="gray" className="leading-relaxed">
                vs. your income baseline this month
              </Text>
            </div>
          ) : (
            <div className="mt-4 flex min-w-0 flex-col gap-2">
              <p className="text-5xl font-semibold tracking-tight wrap-break-word tabular-nums text-gray-950 sm:text-6xl dark:text-white">
                {formatFromUsd(snap.availableThisMonthUsd)}
              </p>
              <Text size="3" weight="medium" color="gray" className="leading-relaxed">
                left this month
              </Text>
            </div>
          )}
        </div>

        {showSafeToSpend ? (
          <div className="rounded-2xl border border-gray-600/12 bg-gray-900/3 p-5 dark:bg-white/4 lg:max-w-sm lg:shrink-0">
            <Text size="2" color="gray" weight="medium" className="block leading-snug">
              Safe to spend
            </Text>
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-gray-950 sm:text-4xl dark:text-white">
              {formatFromUsd(v.safeDailyUsd!)}
            </p>
            <Text size="2" color="gray" className="mt-1 leading-relaxed">
              You can spend this much today.
            </Text>
          </div>
        ) : null}
      </div>

      {insightLine ? (
        <Text
          size="3"
          weight="medium"
          color="gray"
          className="mt-6 max-w-3xl leading-relaxed lg:mt-8"
        >
          {insightLine}
        </Text>
      ) : null}

      <div className="mt-8 grid gap-4 border-t border-gray-600/10 pt-6 sm:grid-cols-3 dark:border-white/10">
        <SupportStat
          label="Income planned"
          value={
            snap.needsIncomePlan
              ? "Not set"
              : `${formatFromUsd(snap.monthlyIncomeUsd)} / mo`
          }
        />
        <SupportStat label="Spent so far" value={formatFromUsd(snap.currentMonthExpensesUsd)} />
        <SupportStat label="Remaining" value={remainingSecondary} />
      </div>
    </Card>
  );
}
