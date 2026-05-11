"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import { Progress } from "frosted-ui";
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
    <div className="flex flex-col gap-8">
      {/* ───── Header ───── */}
      <header className="min-w-0">
        <span className="eyebrow">
          <span className="eyebrow-gold">N°01</span>
          <span aria-hidden style={{ margin: "0 0.5em", color: "var(--ink-faint)" }}>
            —
          </span>
          {format(new Date(), "MMMM yyyy", { locale: enUS })}
        </span>
        <h2
          className="heading-display mt-3"
          style={{ color: "var(--ink)", fontSize: "clamp(1.6rem, 3.6vw, 2.15rem)", lineHeight: 1.1 }}
        >
          Insights
        </h2>
        <p className="mt-2 max-w-prose" style={{ color: "var(--ink-muted)", fontSize: "0.95rem", lineHeight: 1.55 }}>
          Charts, pace, and category breakdown for the month.
        </p>
      </header>

      <SpendingVelocityCard />

      <div className="atelier-rule" role="presentation">
        <span aria-hidden>✦</span>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <section className="atelier-card min-w-0 p-5">
          <span className="eyebrow">Distribution</span>
          <h3
            className="heading-display mt-1.5"
            style={{ color: "var(--ink)", fontSize: "1.2rem", lineHeight: 1.2 }}
          >
            Spending by category
          </h3>
          <p className="mt-1" style={{ color: "var(--ink-muted)", fontSize: "0.85rem", lineHeight: 1.5 }}>
            Where money went this month
          </p>
          {c.currency !== "USD" ? (
            <p
              className="mt-2"
              style={{ color: "var(--ink-faint)", fontSize: "0.78rem", lineHeight: 1.4 }}
            >
              Chart uses USD internally; overview uses {c.currency}.
            </p>
          ) : null}
          <div className="mt-5">
            <CategoryPie data={pie} />
          </div>
        </section>

        <section className="atelier-card min-w-0 p-5">
          <span className="eyebrow">Cadence</span>
          <h3
            className="heading-display mt-1.5"
            style={{ color: "var(--ink)", fontSize: "1.2rem", lineHeight: 1.2 }}
          >
            Last 7 days
          </h3>
          <p className="mt-1" style={{ color: "var(--ink-muted)", fontSize: "0.85rem", lineHeight: 1.5 }}>
            Daily expense totals
          </p>
          {c.currency !== "USD" ? (
            <p
              className="mt-2"
              style={{ color: "var(--ink-faint)", fontSize: "0.78rem", lineHeight: 1.4 }}
            >
              Bars follow stored USD; axis uses {c.currency}.
            </p>
          ) : null}
          <div className="mt-5">
            <WeekBarChart data={weekBars} />
          </div>
        </section>
      </div>

      <div className="atelier-rule" role="presentation">
        <span aria-hidden>✦</span>
      </div>

      <section className="atelier-card-elevated" style={{ padding: "1.4rem 1.5rem" }}>
        <span className="eyebrow">
          <span className="eyebrow-gold">N°02</span>
          <span aria-hidden style={{ margin: "0 0.5em", color: "var(--ink-faint)" }}>
            —
          </span>
          Breakdown
        </span>
        <h3
          className="heading-display mt-1.5 mb-5"
          style={{ color: "var(--ink)", fontSize: "1.25rem", lineHeight: 1.2 }}
        >
          By category
        </h3>
        {state.categories.length === 0 ? (
          <p style={{ color: "var(--ink-muted)", fontSize: "0.9rem", lineHeight: 1.6 }}>
            Add categories under Budgets to see a detailed breakdown.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            {state.categories.map((cat) => {
              const used = categorySpendThisMonth(cat.id, state.transactions, new Date());
              const pct = cat.budgetLimit > 0 ? Math.min(100, (used / cat.budgetLimit) * 100) : 0;
              return (
                <div
                  key={cat.id}
                  className="atelier-card"
                  style={{ padding: "1rem 1.1rem" }}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: cat.color }}
                        aria-hidden
                      />
                      <span
                        className="min-w-0 truncate"
                        style={{ color: "var(--ink)", fontWeight: 500, fontSize: "0.92rem" }}
                      >
                        {cat.name}
                      </span>
                    </div>
                    <span
                      className="w-full shrink-0 tabular text-left sm:w-auto sm:text-right"
                      style={{ color: "var(--ink-muted)", fontSize: "0.82rem" }}
                    >
                      {fmt(used)} / {fmt(cat.budgetLimit)}
                    </span>
                  </div>
                  <div className="mt-3">
                    <Progress value={pct} color={pct > 95 ? "ruby" : "gold"} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
