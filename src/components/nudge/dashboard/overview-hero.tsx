"use client";

import { useMemo } from "react";
import { useCurrency } from "@/context/currency-context";
import { useNudgeBudget } from "@/context/nudge-budget-context";
import { computeMonthlyRemaining } from "@/lib/budget/monthly-remaining";
import { computeMonthlySpendingVelocity } from "@/lib/budget/velocity";

function SupportStat(props: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="eyebrow">{props.label}</span>
      <span
        className="tabular"
        style={{ color: "var(--ink)", fontSize: "0.98rem", fontWeight: 500, lineHeight: 1.25 }}
      >
        {props.value}
      </span>
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

  const dataTone: "overdue" | "warm" | "success" | undefined = snap.needsIncomePlan
    ? "warm"
    : snap.isOverBudget
      ? "overdue"
      : snap.availableThisMonthUsd >= 0
        ? "success"
        : undefined;

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

  // Hero numeral color: keep gold sacred for affirmation only
  const numeralColor = snap.isOverBudget
    ? "var(--tone-overdue)"
    : snap.needsIncomePlan
      ? "var(--ink)"
      : "var(--ink)";

  return (
    <section
      className="atelier-card-elevated"
      data-tone={dataTone}
      style={{ padding: "clamp(1.25rem, 3vw, 2rem)" }}
    >
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
        {/* ─ Hero numeral ─ */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span aria-hidden style={{ color: "var(--gold)" }}>
              ✦
            </span>
            <span className="eyebrow">
              {snap.needsIncomePlan ? "Awaiting income plan" : snap.isOverBudget ? "Over by" : "Left this month"}
            </span>
          </div>

          {snap.needsIncomePlan ? (
            <>
              <p
                className="heading-display mt-4"
                style={{
                  color: "var(--ink)",
                  fontSize: "clamp(2rem, 5.5vw, 2.75rem)",
                  lineHeight: 1.05,
                  letterSpacing: "-0.015em",
                }}
              >
                Set monthly income
              </p>
              <p className="mt-3 max-w-md" style={{ color: "var(--ink-muted)", lineHeight: 1.6 }}>
                Add your plan under{" "}
                <span style={{ color: "var(--ink)", fontWeight: 600 }}>Budgets</span> to see what&apos;s
                left.
              </p>
            </>
          ) : (
            <div className="mt-4 flex min-w-0 flex-col gap-2">
              <p
                className="heading-display tabular wrap-break-word"
                style={{
                  color: numeralColor,
                  fontSize: "clamp(2.75rem, 8vw, 4.25rem)",
                  fontWeight: 400,
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                  fontVariationSettings: '"opsz" 144, "SOFT" 20',
                }}
              >
                {formatFromUsd(
                  snap.isOverBudget
                    ? Math.abs(snap.availableThisMonthUsd)
                    : snap.availableThisMonthUsd,
                )}
              </p>
              <p
                style={{
                  color: "var(--ink-muted)",
                  fontSize: "0.92rem",
                  letterSpacing: "0.02em",
                }}
              >
                {snap.isOverBudget ? "vs. your income baseline this month" : "left this month"}
              </p>
            </div>
          )}
        </div>

        {/* ─ Safe-to-spend aside ─ */}
        {showSafeToSpend ? (
          <aside
            className="atelier-card lg:max-w-sm lg:shrink-0"
            style={{ padding: "1.25rem 1.4rem" }}
          >
            <span className="eyebrow">
              <span className="eyebrow-gold">✦</span>
              <span style={{ marginLeft: "0.4em" }}>Safe to spend today</span>
            </span>
            <p
              className="heading-display tabular mt-3"
              style={{
                color: "var(--ink)",
                fontSize: "clamp(1.85rem, 4vw, 2.4rem)",
                fontWeight: 400,
                lineHeight: 1,
                letterSpacing: "-0.015em",
              }}
            >
              {formatFromUsd(v.safeDailyUsd!)}
            </p>
            <p className="mt-2" style={{ color: "var(--ink-muted)", fontSize: "0.85rem", lineHeight: 1.55 }}>
              You can spend this much today.
            </p>
          </aside>
        ) : null}
      </div>

      {insightLine ? (
        <p
          className="mt-7 max-w-3xl italic"
          style={{
            color: "var(--ink-soft)",
            fontFamily: "var(--font-fraunces), serif",
            fontSize: "1rem",
            lineHeight: 1.6,
          }}
        >
          “{insightLine}”
        </p>
      ) : null}

      <div
        className="mt-8 grid gap-5 pt-6 sm:grid-cols-3"
        style={{ borderTop: "1px solid var(--hairline)" }}
      >
        <SupportStat
          label="Income planned"
          value={
            snap.needsIncomePlan ? "Not set" : `${formatFromUsd(snap.monthlyIncomeUsd)} / mo`
          }
        />
        <SupportStat label="Spent so far" value={formatFromUsd(snap.currentMonthExpensesUsd)} />
        <SupportStat label="Remaining" value={remainingSecondary} />
      </div>
    </section>
  );
}
