"use client";

import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import { Badge, Card, Heading, Text } from "frosted-ui";
import { useCurrency } from "@/context/currency-context";
import { useNudgeBudget } from "@/context/nudge-budget-context";
import { computeMonthlyRemaining } from "@/lib/budget/monthly-remaining";

export function MonthlyRemainingCard() {
  const { state } = useNudgeBudget();
  const { formatFromUsd } = useCurrency();

  const now = new Date();
  const snap = computeMonthlyRemaining(state, now);

  const ring = snap.needsIncomePlan
    ? "ring-1 ring-gray-500/15"
    : snap.isOverBudget
      ? "ring-1 ring-ruby-500/22"
      : "ring-1 ring-emerald-500/20";

  const pctLine =
    snap.remainingPercent != null ? `${Math.round(snap.remainingPercent)}% remaining` : "—";

  const remainingSecondary = snap.needsIncomePlan ? "—" : pctLine;

  const heroSecondary = snap.needsIncomePlan
    ? `${format(now, "MMMM yyyy", { locale: enUS })} · set your plan below for a personalized number`
    : snap.isOverBudget
      ? "You have spent more than your income baseline for this month."
      : "Based on planned income vs. anything extra you already logged.";

  return (
    <Card size="3" variant="surface" className={`nudge-card-surface nudge-card-frosted ${ring}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <Badge color="gold" size="1" className="font-medium">
            Left this month
          </Badge>
          {snap.needsIncomePlan ? (
            <Heading
              size="7"
              className="mt-4 min-w-0 tracking-tight text-gray-950 dark:text-white"
            >
              Set monthly income first
            </Heading>
          ) : snap.isOverBudget ? (
            <div className="mt-4 flex min-w-0 flex-col gap-2">
              <Text size="2" weight="medium" color="ruby" className="uppercase tracking-wide">
                Over by
              </Text>
              <p className="text-5xl font-semibold tracking-tight wrap-break-word tabular-nums text-ruby-600 sm:text-6xl dark:text-ruby-400">
                {formatFromUsd(Math.abs(snap.availableThisMonthUsd))}
              </p>
              <Text size="3" color="gray" className="leading-relaxed">
                this month
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
          <Text size="2" color="gray" className="mt-3 max-w-2xl leading-relaxed">
            {heroSecondary}
          </Text>
        </div>
      </div>

      <div className="mt-8 grid gap-4 border-t border-gray-600/10 pt-6 sm:grid-cols-3 dark:border-white/10">
        <SupportStat
          label="Income planned"
          value={
            snap.needsIncomePlan
              ? "Not set"
              : `${formatFromUsd(snap.monthlyIncomeUsd)} / mo`
          }
        />
        <SupportStat
          label="Spent so far"
          value={formatFromUsd(snap.currentMonthExpensesUsd)}
        />
        <SupportStat label="Remaining percentage" value={remainingSecondary} />
      </div>
    </Card>
  );
}

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
