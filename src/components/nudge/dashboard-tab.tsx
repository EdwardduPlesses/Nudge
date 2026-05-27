"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import { AddTransactionDialog } from "@/components/nudge/add-transaction-dialog";
import { AiMoneyPlanCta } from "@/components/nudge/dashboard/ai-money-plan-cta";
import { CategoryHealthList } from "@/components/nudge/dashboard/category-health-list";
import { OverviewHero } from "@/components/nudge/dashboard/overview-hero";
import { useCurrency } from "@/context/currency-context";
import { useNudgeBudget } from "@/context/nudge-budget-context";
import { computeMonthlySpendingVelocity } from "@/lib/budget/velocity";
import {
  memberLabel,
  sumExpenses,
  sumIncome,
  transactionsByActor,
  transactionsThisMonth,
} from "@/lib/budget/selectors";

function WhoPill(props: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="max-w-[220px] truncate"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        minHeight: 32,
        padding: "0 0.85rem",
        borderRadius: 999,
        fontFamily: "var(--font-manrope), sans-serif",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
        cursor: "pointer",
        transition: "background 200ms ease, border-color 200ms ease, color 200ms ease",
        background: props.active
          ? "color-mix(in srgb, var(--gold-bright) 12%, var(--surface))"
          : "var(--surface)",
        border: `1px solid ${props.active ? "var(--hairline-gold)" : "var(--hairline-strong)"}`,
        color: props.active ? "var(--gold)" : "var(--ink-soft)",
      }}
    >
      {props.label}
    </button>
  );
}

export function DashboardTab() {
  const { state } = useNudgeBudget();
  const c = useCurrency();
  const fmt = c.formatFromUsd;
  const [whoFilter, setWhoFilter] = useState<string>("all");

  // Person filter narrows the spend/velocity/category figures (income totals stay
  // whole-household). Wrap the transaction source the cards compute from.
  const scopedTransactions = useMemo(
    () =>
      whoFilter === "all"
        ? state.transactions
        : transactionsByActor(state.transactions, { mode: "user", userId: whoFilter }),
    [state.transactions, whoFilter],
  );

  const monthTx = useMemo(
    () => transactionsThisMonth(scopedTransactions, new Date()),
    [scopedTransactions],
  );
  const income = useMemo(() => sumIncome(monthTx), [monthTx]);
  const spent = useMemo(() => sumExpenses(monthTx), [monthTx]);
  const net = income - spent;

  const v = useMemo(
    () => computeMonthlySpendingVelocity(scopedTransactions, state.categories),
    [scopedTransactions, state.categories],
  );

  const forecastDisplay =
    v.hasBudget && v.hasExpenseData ? fmt(v.forecast) : "—";

  return (
    <div className="flex flex-col gap-9">
      {/* ───── Section header ───── */}
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <span className="eyebrow">
            <span className="eyebrow-gold">N°01</span>
            <span aria-hidden style={{ margin: "0 0.5em", color: "var(--ink-faint)" }}>
              —
            </span>
            {format(new Date(), "MMMM yyyy", { locale: enUS })}
          </span>
          <h2
            className="heading-display mt-3"
            style={{
              color: "var(--ink)",
              fontSize: "clamp(1.6rem, 3.6vw, 2.15rem)",
              lineHeight: 1.1,
            }}
          >
            Stay on track
          </h2>
          <p
            className="mt-2 max-w-md"
            style={{ color: "var(--ink-muted)", fontSize: "0.95rem", lineHeight: 1.55 }}
          >
            See what&apos;s left and where to focus.
          </p>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
          <AiMoneyPlanCta />
          <AddTransactionDialog
            trigger={
              <button type="button" className="atelier-btn-gold w-full sm:w-auto" aria-label="Add income or expense">
                <span aria-hidden style={{ fontSize: "1rem", lineHeight: 1 }}>
                  ✦
                </span>
                Add transaction
              </button>
            }
          />
        </div>
      </header>

      {state.members.length >= 2 ? (
        <div>
          <span className="eyebrow mb-2 block">Who</span>
          <div className="flex flex-wrap gap-2">
            <WhoPill
              active={whoFilter === "all"}
              label="All"
              onClick={() => setWhoFilter("all")}
            />
            {state.members.map((m) => (
              <WhoPill
                key={m.whopUserId}
                active={whoFilter === m.whopUserId}
                label={memberLabel(state.members, m.whopUserId)}
                onClick={() => setWhoFilter(m.whopUserId)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {state.transactions.length === 0 ? (
        <div
          className="atelier-card p-5"
          style={{ borderStyle: "dashed", borderColor: "var(--hairline-strong)" }}
        >
          <p style={{ color: "var(--ink-soft)", fontSize: "0.9rem", lineHeight: 1.55 }}>
            No activity yet. Log your first expense with{" "}
            <span style={{ color: "var(--ink)", fontWeight: 600 }}>Add transaction</span> to populate
            this overview.
          </p>
        </div>
      ) : null}

      {state.transactions.length > 0 && monthTx.length === 0 ? (
        <p style={{ color: "var(--ink-muted)", fontSize: "0.9rem", lineHeight: 1.55 }}>
          Nothing dated in {format(new Date(), "MMMM yyyy", { locale: enUS })}. Check{" "}
          <span style={{ color: "var(--ink)", fontWeight: 600 }}>Activity</span> or add a transaction
          for this month.
        </p>
      ) : null}

      <OverviewHero />

      <div className="atelier-rule" role="presentation">
        <span aria-hidden>✦</span>
      </div>

      {/* ───── This month ───── */}
      <section aria-label="This month summary">
        <div className="mb-4">
          <span className="eyebrow">
            <span className="eyebrow-gold">N°02</span>
            <span aria-hidden style={{ margin: "0 0.5em", color: "var(--ink-faint)" }}>
              —
            </span>
            Ledger Summary
          </span>
          <h3
            className="heading-display mt-1.5"
            style={{ color: "var(--ink)", fontSize: "1.35rem", lineHeight: 1.15 }}
          >
            This month
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Stat label="Income" value={fmt(income)} />
          <Stat label="Spending" value={fmt(spent)} />
          <Stat
            label="Net"
            value={fmt(net)}
            valueColor={net >= 0 ? undefined : "var(--tone-overdue)"}
          />
          <Stat label="Forecast" value={forecastDisplay} hint="Month-end at today's pace" />
        </div>
      </section>

      <div className="atelier-rule" role="presentation">
        <span aria-hidden>✦</span>
      </div>

      {/* ───── Category health ───── */}
      <section aria-label="Category health">
        <div className="mb-4">
          <span className="eyebrow">
            <span className="eyebrow-gold">N°03</span>
            <span aria-hidden style={{ margin: "0 0.5em", color: "var(--ink-faint)" }}>
              —
            </span>
            Allocations
          </span>
        </div>
        <CategoryHealthList />
      </section>
    </div>
  );
}

function Stat(props: {
  label: string;
  value: string;
  hint?: string;
  valueColor?: string;
}) {
  return (
    <div className="atelier-stat">
      <p className="atelier-stat-label">{props.label}</p>
      <p
        className="atelier-stat-value"
        style={props.valueColor ? { color: props.valueColor } : undefined}
      >
        {props.value}
      </p>
      <div style={{ minHeight: "1rem" }}>
        {props.hint ? <p className="atelier-stat-hint">{props.hint}</p> : null}
      </div>
    </div>
  );
}
