"use client";

import { useMemo } from "react";
import { Progress } from "frosted-ui";
import { useCurrency } from "@/context/currency-context";
import { useNudgeBudget } from "@/context/nudge-budget-context";
import {
  computeMonthlySpendingVelocity,
  type SpendingVelocityStatus,
} from "@/lib/budget/velocity";

type ChipTone = "success" | "warm" | "overdue" | undefined;

function toneToChipTone(t: "positive" | "warning" | "negative" | "neutral"): ChipTone {
  if (t === "positive") return "success";
  if (t === "warning") return "warm";
  if (t === "negative") return "overdue";
  return undefined;
}

export function SpendingVelocityCard() {
  const { state } = useNudgeBudget();
  const { formatAmount } = useCurrency();

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
      return `At this pace, you may exceed your budget by ${formatAmount(v.insight.overAmountUsd)}.`;
    }
    if (v.insight.kind === "reduce_daily") {
      return `Reduce daily spending by ${formatAmount(v.insight.reductionUsd)} to stay on track.`;
    }
    return null;
  }, [formatAmount, v.hasBudget, v.insight]);

  const progressPct = v.hasBudget && v.budget > 0 ? (v.forecast / v.budget) * 100 : 0;
  const cappedProgressForBar =
    Number.isFinite(progressPct) ? Math.min(130, Math.max(0, progressPct)) : 0;
  const showProgress = !priorBudget && !noSpend;
  const showMainForecast = !priorBudget && !noSpend;

  const dataTone: "success" | "warm" | "overdue" | undefined =
    priorBudget || noSpend
      ? undefined
      : badge.tone === "positive"
        ? "success"
        : badge.tone === "warning"
          ? "warm"
          : badge.tone === "negative"
            ? "overdue"
            : undefined;

  return (
    <section
      className="atelier-card-elevated"
      data-tone={dataTone}
      style={{ padding: "1.4rem 1.5rem" }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          <span className="eyebrow">Forecast</span>
          <h3
            className="heading-display mt-1.5"
            style={{ color: "var(--ink)", fontSize: "1.25rem", lineHeight: 1.2 }}
          >
            Monthly Spending Forecast
          </h3>
          {showMainForecast ? (
            <div className="mt-4 flex flex-col gap-2">
              <span
                className="heading-display tabular wrap-break-word"
                style={{
                  color: "var(--ink)",
                  fontSize: "clamp(1.75rem, 4.4vw, 2.4rem)",
                  fontWeight: 400,
                  lineHeight: 1.05,
                  letterSpacing: "-0.015em",
                }}
              >
                {formatAmount(v.forecast)}
              </span>
              <p style={{ color: "var(--ink-muted)", fontSize: "0.88rem", lineHeight: 1.5 }}>
                Projected month-end spending at today&apos;s pace
              </p>
            </div>
          ) : null}
        </div>

        {!priorBudget && !noSpend && badge.label !== "" ? (
          <span className="atelier-chip shrink-0" data-tone={toneToChipTone(badge.tone)}>
            {badge.label}
          </span>
        ) : null}
      </div>

      {priorBudget ? (
        <div className="mt-6 space-y-1.5">
          <p style={{ color: "var(--ink-soft)", fontSize: "0.9rem", fontWeight: 500 }}>
            No budget limits set
          </p>
          {!v.hasExpenseData ? (
            <p style={{ color: "var(--ink-muted)", fontSize: "0.85rem", lineHeight: 1.55 }}>
              No spending data yet this month
            </p>
          ) : null}
        </div>
      ) : noSpend ? (
        <p
          className="mt-6"
          style={{ color: "var(--ink-soft)", fontSize: "0.9rem", fontWeight: 500, lineHeight: 1.55 }}
        >
          No spending data yet this month
        </p>
      ) : (
        <>
          <div className="mt-6 grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            <VelocityMetric label="Total spent (month)" value={formatAmount(v.totalSpent)} />
            <VelocityMetric label="Daily average" value={formatAmount(v.dailyRate)} />
            <VelocityMetric label="Forecasted total" value={formatAmount(v.forecast)} />
            <VelocityMetric label="Total budget" value={formatAmount(v.budget)} />
          </div>

          {v.safeDailyUsd != null && Number.isFinite(v.safeDailyUsd) ? (
            <div
              className="mt-5"
              style={{
                paddingTop: "1.25rem",
                borderTop: "1px solid var(--hairline)",
              }}
            >
              <span className="eyebrow">Safe daily spend ({v.remainingInclusiveDays} days left)</span>
              <p
                className="heading-display tabular mt-1.5"
                style={{
                  color: v.safeDailyUsd < 0 ? "var(--tone-overdue)" : "var(--ink)",
                  fontSize: "1.4rem",
                  fontWeight: 500,
                  lineHeight: 1.1,
                  letterSpacing: "-0.01em",
                }}
              >
                {formatAmount(v.safeDailyUsd)}
                <span
                  className="ml-1"
                  style={{
                    color: "var(--ink-muted)",
                    fontSize: "0.85rem",
                    fontFamily: "var(--font-manrope), sans-serif",
                    fontWeight: 500,
                    letterSpacing: 0,
                  }}
                >
                  / day
                </span>
              </p>
            </div>
          ) : null}

          {showProgress ? (
            <div className="mt-6">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                <span className="eyebrow">Forecast vs budget</span>
                <span
                  className="min-w-0 tabular text-right"
                  style={{ color: "var(--ink-muted)", fontSize: "0.82rem" }}
                >
                  {formatAmount(v.forecast)} / {formatAmount(v.budget)}
                </span>
              </div>
              <Progress
                value={Math.min(cappedProgressForBar, 100)}
                color={v.forecast > v.budget ? "ruby" : "gold"}
              />
              {progressPct > 100 ? (
                <p
                  className="mt-1.5 tabular"
                  style={{ color: "var(--ink-muted)", fontSize: "0.78rem" }}
                >
                  Projection is over 100% of your category budget ceiling
                </p>
              ) : null}
            </div>
          ) : null}

          {insightText ? (
            <p
              className="mt-5 italic"
              style={{
                color: "var(--ink-soft)",
                fontFamily: "var(--font-fraunces), serif",
                fontSize: "0.95rem",
                lineHeight: 1.6,
              }}
            >
              “{insightText}”
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function VelocityMetric(props: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="eyebrow">{props.label}</span>
      <span
        className="heading-display tabular wrap-break-word"
        style={{
          color: "var(--ink)",
          fontSize: "1.25rem",
          fontWeight: 400,
          letterSpacing: "-0.005em",
          lineHeight: 1.1,
        }}
      >
        {props.value}
      </span>
    </div>
  );
}

function statusBadgeUi(status: SpendingVelocityStatus | undefined): {
  label: string;
  tone: "positive" | "warning" | "negative" | "neutral";
} {
  switch (status) {
    case "ON_TRACK":
      return { label: "On track", tone: "positive" };
    case "WARNING":
      return { label: "Warning", tone: "warning" };
    case "OVERSPENDING":
      return { label: "Overspending", tone: "negative" };
    default:
      return { label: "", tone: "neutral" };
  }
}
