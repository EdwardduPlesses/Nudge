"use client";

import { useMemo } from "react";
import { Badge, Card, Heading, Progress, Text } from "frosted-ui";
import { useCurrency } from "@/context/currency-context";
import { useNudgeBudget } from "@/context/nudge-budget-context";
import {
  computeMonthlySpendingVelocity,
  type SpendingVelocityStatus,
} from "@/lib/budget/velocity";

export function SpendingVelocityCard() {
  const { state } = useNudgeBudget();
  const { formatFromUsd } = useCurrency();

  const v = useMemo(
    () => computeMonthlySpendingVelocity(state.transactions, state.categories),
    [state.transactions, state.categories],
  );

  const badge = statusBadgeUi(v.status);
  const priorBudget = !v.hasBudget;
  const noSpend = priorBudget ? false : !v.hasExpenseData;

  const insightText = useMemo(() => {
    if (!v.hasBudget || v.insight == null) return null;
    if (v.insight.kind === "on_track") {
      return "You are on track to stay within budget.";
    }
    if (v.insight.kind === "exceed_by") {
      return `At this pace, you may exceed your budget by ${formatFromUsd(v.insight.overAmountUsd)}.`;
    }
    if (v.insight.kind === "reduce_daily") {
      return `Reduce daily spending by ${formatFromUsd(v.insight.reductionUsd)} to stay on track.`;
    }
    return null;
  }, [formatFromUsd, v.hasBudget, v.insight]);

  const progressPct = v.hasBudget && v.budget > 0 ? (v.forecast / v.budget) * 100 : 0;
  const cappedProgressForBar =
    Number.isFinite(progressPct) ? Math.min(130, Math.max(0, progressPct)) : 0;
  const showProgress = !priorBudget && !noSpend;

  let ring =
    badge.tone === "positive"
      ? "ring-emerald-500/20 ring-1"
      : badge.tone === "warning"
        ? "ring-amber-500/25 ring-1"
        : badge.tone === "negative"
          ? "ring-ruby-500/22 ring-1"
          : "ring-gray-500/15 ring-1";

  if (priorBudget || noSpend) ring = "ring-gray-500/15 ring-1";

  const showMainForecast = !priorBudget && !noSpend;

  return (
    <Card size="3" variant="surface" className={`nudge-card-surface ${ring}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <Heading size="4" className="tracking-tight">
            Monthly Spending Forecast
          </Heading>
          {showMainForecast ? (
            <div className="mt-3 flex flex-col gap-2">
              <Heading size="6" className="block tabular-nums tracking-tight">
                {formatFromUsd(v.forecast)}
              </Heading>
              <Text size="2" color="gray" className="block leading-relaxed">
                Projected month-end spending at today&apos;s pace
              </Text>
            </div>
          ) : null}
        </div>

        {!priorBudget && !noSpend && badge.label !== "" ? (
          <Badge color={badge.color} size="2" className="shrink-0">
            {badge.label}
          </Badge>
        ) : null}
      </div>

      {priorBudget ? (
        <div className="mt-6 space-y-2">
          <Text size="2" color="gray" weight="medium">
            No budget limits set
          </Text>
          {!v.hasExpenseData ? (
            <Text size="2" color="gray" className="leading-relaxed">
              No spending data yet this month
            </Text>
          ) : null}
        </div>
      ) : noSpend ? (
        <Text size="2" color="gray" weight="medium" className="mt-6 leading-relaxed">
          No spending data yet this month
        </Text>
      ) : (
        <>
          <div className="mt-6 grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            <VelocityMetric label="Total spent (month)" value={formatFromUsd(v.totalSpent)} />
            <VelocityMetric label="Daily average" value={formatFromUsd(v.dailyRate)} />
            <VelocityMetric label="Forecasted total" value={formatFromUsd(v.forecast)} />
            <VelocityMetric label="Total budget" value={formatFromUsd(v.budget)} />
          </div>

          {v.safeDailyUsd != null && Number.isFinite(v.safeDailyUsd) ? (
            <div className="mt-5">
              <Text size="2" color="gray" weight="medium">
                Safe daily spend ({v.remainingInclusiveDays} days left):{" "}
                <span
                  className={
                    v.safeDailyUsd < 0
                      ? "font-medium tabular-nums text-ruby-600 dark:text-ruby-400"
                      : "font-medium tabular-nums text-gray-950 dark:text-white"
                  }
                >
                  {formatFromUsd(v.safeDailyUsd)}
                  {" / day"}
                </span>
              </Text>
            </div>
          ) : null}

          {showProgress ? (
            <div className="mt-6">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <Text size="2" weight="medium">
                  Forecast vs budget
                </Text>
                <Text size="2" color="gray" className="tabular-nums">
                  {formatFromUsd(v.forecast)}
                  {" / "}
                  {formatFromUsd(v.budget)}
                </Text>
              </div>
              <Progress
                value={Math.min(cappedProgressForBar, 100)}
                color={v.forecast > v.budget ? "ruby" : "gold"}
              />
              {progressPct > 100 ? (
                <Text size="1" color="gray" className="mt-1.5 tabular-nums">
                  Projection is over 100% of your category budget ceiling
                </Text>
              ) : null}
            </div>
          ) : null}

          {insightText ? (
            <Text size="2" color="gray" className="mt-5 leading-relaxed">
              {insightText}
            </Text>
          ) : null}
        </>
      )}
    </Card>
  );
}

function VelocityMetric(props: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Text size="2" color="gray" className="block leading-snug">
        {props.label}
      </Text>
      <Text size="5" weight="medium" className="block min-w-0 tabular-nums tracking-tight">
        {props.value}
      </Text>
    </div>
  );
}

function statusBadgeUi(status: SpendingVelocityStatus | undefined): {
  label: string;
  color: "jade" | "amber" | "ruby";
  tone: "positive" | "warning" | "negative" | "neutral";
} {
  switch (status) {
    case "ON_TRACK":
      return { label: "On track", color: "jade", tone: "positive" };
    case "WARNING":
      return { label: "Warning", color: "amber", tone: "warning" };
    case "OVERSPENDING":
      return { label: "Overspending", color: "ruby", tone: "negative" };
    default:
      return { label: "", color: "jade", tone: "neutral" };
  }
}
