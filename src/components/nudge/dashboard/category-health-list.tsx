"use client";

import { useMemo } from "react";
import { Badge, Card, Heading, Progress, Text } from "frosted-ui";
import { useCurrency } from "@/context/currency-context";
import { useNudgeBudget } from "@/context/nudge-budget-context";
import {
  computeCategoryHealthRows,
  type CategoryHealthStatus,
} from "@/lib/budget/category-health";

function statusBadgeProps(status: CategoryHealthStatus): { label: string; color: "jade" | "amber" | "gold" | "ruby" } {
  switch (status) {
    case "SAFE":
      return { label: "Safe", color: "jade" };
    case "WARNING":
      return { label: "Warning", color: "amber" };
    case "HIGH":
      return { label: "High", color: "gold" };
    case "OVER":
      return { label: "Over", color: "ruby" };
  }
}

function progressColor(status: CategoryHealthStatus | null): "jade" | "amber" | "gold" | "ruby" {
  if (status == null) return "gold";
  switch (status) {
    case "SAFE":
      return "jade";
    case "WARNING":
      return "amber";
    case "HIGH":
      return "gold";
    case "OVER":
      return "ruby";
  }
}

export function CategoryHealthList() {
  const { state } = useNudgeBudget();
  const { formatFromUsd } = useCurrency();

  const rows = useMemo(
    () => computeCategoryHealthRows(state, new Date()),
    [state],
  );

  if (state.categories.length === 0) {
    return (
      <Card size="3" variant="surface" className="nudge-card-surface nudge-card-frosted ring-1 ring-gray-500/15">
        <Heading size="4" className="tracking-tight">
          Category health
        </Heading>
        <Text size="2" color="gray" className="mt-3 leading-relaxed">
          Add budget categories to see how much of each limit you have used this month.
        </Text>
      </Card>
    );
  }

  return (
    <Card size="3" variant="surface" className="nudge-card-surface nudge-card-frosted ring-1 ring-gray-500/15">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <Heading size="4" className="tracking-tight">
            Category health
          </Heading>
          <Text size="2" color="gray" className="mt-2 leading-relaxed">
            Spending vs. each category limit this month.
          </Text>
        </div>
      </div>

      <ul className="mt-5 space-y-4" role="list">
        {rows.map((row) => {
          const hasLimit = row.percentUsed != null && row.status != null;
          const barValue =
            row.percentUsed != null
              ? Math.min(100, Math.max(0, row.percentUsed))
              : 0;
          const pctLabel = row.percentUsed == null ? null : `${Math.round(row.percentUsed)}%`;
          const statusBadge = row.status != null ? statusBadgeProps(row.status) : null;

          return (
            <li
              key={row.categoryId}
              className="rounded-2xl border border-gray-600/15 bg-gray-900/4 p-4 dark:bg-white/4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <Text weight="medium" className="leading-snug">
                      {row.name}
                    </Text>
                    <Text size="2" color="gray" className="mt-1 leading-relaxed">
                      {row.insight}
                    </Text>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {statusBadge != null ? (
                      <Badge size="1" color={statusBadge.color} className="font-medium">
                        {statusBadge.label}
                      </Badge>
                    ) : null}
                    {pctLabel != null ? (
                      <Text size="2" color="gray" className="tabular-nums">
                        {pctLabel}
                      </Text>
                    ) : null}
                  </div>
                  <Text size="2" color="gray" className="text-right tabular-nums sm:max-w-56">
                    {row.percentUsed == null ? (
                      <>{formatFromUsd(row.currentMonthCategorySpendUsd)} spent</>
                    ) : (
                      <>
                        {formatFromUsd(row.currentMonthCategorySpendUsd)} /{" "}
                        {formatFromUsd(row.categoryLimitUsd)}
                      </>
                    )}
                  </Text>
                </div>
              </div>
              {hasLimit ? (
                <div className="mt-3">
                  <Progress value={barValue} color={progressColor(row.status)} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
