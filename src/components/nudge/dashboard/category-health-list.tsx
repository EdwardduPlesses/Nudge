"use client";

import { useMemo } from "react";
import { useCurrency } from "@/context/currency-context";
import { useNudgeBudget } from "@/context/nudge-budget-context";
import {
  computeCategoryHealthRows,
  type CategoryHealthStatus,
} from "@/lib/budget/category-health";
import type { Transaction } from "@/lib/budget/types";

type Tone = "success" | "warm" | "info" | "overdue" | undefined;

function statusChip(status: CategoryHealthStatus | null): {
  label: string;
  tone: Tone;
} {
  if (status == null) return { label: "No limit", tone: undefined };
  switch (status) {
    case "SAFE":
      return { label: "Safe", tone: "success" };
    case "WARNING":
      return { label: "Warning", tone: "warm" };
    case "HIGH":
      return { label: "High", tone: "info" };
    case "OVER":
      return { label: "Over", tone: "overdue" };
  }
}

function barColor(status: CategoryHealthStatus | null): string {
  if (status == null) return "var(--ink-muted)";
  switch (status) {
    case "SAFE":
      return "var(--tone-success)";
    case "WARNING":
      return "var(--tone-warm)";
    case "HIGH":
      return "var(--tone-info)";
    case "OVER":
      return "var(--tone-overdue)";
  }
}

export function CategoryHealthList(props: { transactions?: Transaction[] }) {
  const { state } = useNudgeBudget();
  const { formatAmount } = useCurrency();

  const rows = useMemo(
    () => computeCategoryHealthRows(state, props.transactions),
    [state, props.transactions],
  );

  if (state.categories.length === 0) {
    return (
      <div className="atelier-card p-5">
        <h4
          className="heading-display"
          style={{ color: "var(--ink)", fontSize: "1.2rem", lineHeight: 1.2 }}
        >
          No categories yet
        </h4>
        <p className="mt-2" style={{ color: "var(--ink-muted)", fontSize: "0.9rem", lineHeight: 1.6 }}>
          Open <span style={{ color: "var(--ink)", fontWeight: 600 }}>Budgets</span> to create categories
          and monthly limits — your snapshot will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="atelier-card-elevated" style={{ padding: "1.4rem 1.5rem 1.5rem" }}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h4
            className="heading-display"
            style={{ color: "var(--ink)", fontSize: "1.25rem", lineHeight: 1.2 }}
          >
            Category health
          </h4>
          <p
            className="mt-1"
            style={{ color: "var(--ink-muted)", fontSize: "0.86rem", lineHeight: 1.5 }}
          >
            Spend vs. limit, this month
          </p>
        </div>
        <span className="eyebrow tabular" style={{ color: "var(--ink-faint)" }}>
          {String(rows.length).padStart(2, "0")} entries
        </span>
      </div>

      <ol className="mt-5 flex flex-col" role="list">
        {rows.map((row, idx) => {
          const hasLimit = row.percentUsed != null && row.status != null;
          const barValue =
            row.percentUsed != null ? Math.min(100, Math.max(0, row.percentUsed)) : 0;
          const pctLabel = row.percentUsed == null ? null : `${Math.round(row.percentUsed)}%`;
          const chip = statusChip(row.status);
          const bar = barColor(row.status);

          return (
            <li
              key={row.categoryId}
              className="group flex flex-col gap-2.5 py-4"
              style={{
                borderTop: idx === 0 ? "none" : "1px solid var(--hairline)",
              }}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span
                  className="tabular"
                  style={{
                    color: "var(--ink-faint)",
                    fontSize: "0.7rem",
                    letterSpacing: "0.16em",
                    width: "1.6rem",
                    flexShrink: 0,
                  }}
                  aria-hidden
                >
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: row.color }}
                  aria-hidden
                />
                <span
                  className="flex-1 truncate transition-colors duration-200 group-hover:text-[color:var(--gold)]"
                  style={{
                    color: "var(--ink)",
                    fontWeight: 500,
                    fontSize: "0.95rem",
                    letterSpacing: "0.005em",
                  }}
                >
                  {row.name}
                </span>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {pctLabel != null ? (
                    <span
                      className="tabular"
                      style={{ color: "var(--ink-muted)", fontSize: "0.82rem" }}
                    >
                      {pctLabel}
                    </span>
                  ) : null}
                  <span className="atelier-chip" data-tone={chip.tone}>
                    {chip.label}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pl-[2.85rem]">
                <span
                  className="tabular"
                  style={{ color: "var(--ink-muted)", fontSize: "0.82rem" }}
                >
                  {row.percentUsed == null ? (
                    <>{formatAmount(row.currentMonthCategorySpendUsd)} spent</>
                  ) : (
                    <>
                      {formatAmount(row.currentMonthCategorySpendUsd)} ·{" "}
                      <span style={{ color: "var(--ink-faint)" }}>
                        {formatAmount(row.categoryLimitUsd)} limit
                      </span>
                    </>
                  )}
                </span>
              </div>

              {hasLimit ? (
                <div
                  className="ml-[2.85rem] mt-1 h-px overflow-hidden rounded-full"
                  style={{ background: "var(--hairline-strong)", height: "2px" }}
                  aria-hidden
                >
                  <div
                    style={{
                      width: `${barValue}%`,
                      height: "100%",
                      background: bar,
                      transition: "width 360ms ease",
                    }}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
