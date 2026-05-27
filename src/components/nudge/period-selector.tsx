"use client";

import { Select } from "frosted-ui";
import { useNudgeBudget } from "@/context/nudge-budget-context";
import type { Period } from "@/lib/budget/types";

function periodLabel(p: Period): string {
  return p.label && p.label.trim() ? p.label : `${p.startDate} – ${p.endDate}`;
}

export function PeriodSelector() {
  const { periods, selectedPeriodId, currentPeriodId, selectPeriod, state } =
    useNudgeBudget();

  // Nothing to choose from — show the current period label as static text.
  if (periods.length === 0) {
    const label = state.period ? periodLabel(state.period) : "";
    if (!label) return null;
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <span className="eyebrow">Period</span>
        <span className="tabular" style={{ color: "var(--ink-muted)", fontSize: "0.86rem" }}>
          {label}
        </span>
      </div>
    );
  }

  const value = selectedPeriodId ?? currentPeriodId ?? "";
  const viewingPast =
    !!selectedPeriodId &&
    !!currentPeriodId &&
    selectedPeriodId !== currentPeriodId;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="eyebrow">Period</span>
      <div className="flex flex-wrap items-center gap-2">
        <Select.Root
          value={value}
          onValueChange={(v) => {
            void selectPeriod(v === currentPeriodId ? null : v);
          }}
        >
          <Select.Trigger
            placeholder="Period"
            aria-label="Budget period"
            className="min-h-10 max-w-[min(100%,16rem)]"
          />
          <Select.Content>
            {periods.map((p) => (
              <Select.Item key={p.id} value={p.id}>
                {periodLabel(p)}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        {viewingPast ? (
          <>
            <span className="atelier-chip" data-tone="neutral">
              Read-only — past period
            </span>
            <button
              type="button"
              className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
              onClick={() => {
                void selectPeriod(null);
              }}
            >
              Back to current
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
