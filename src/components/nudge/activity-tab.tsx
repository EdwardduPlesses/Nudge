"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Button, Card, Heading, Text } from "frosted-ui";
import {
  AddTransactionDialog,
  EditTransactionDialog,
} from "@/components/nudge/add-transaction-dialog";
import { useCurrency } from "@/context/currency-context";
import { useNudgeBudget } from "@/context/nudge-budget-context";
import type { Transaction } from "@/lib/budget/types";

type ActivityFilter = "all" | "income" | "expense";

export function ActivityTab() {
  const c = useCurrency();
  const fmt = c.formatFromUsd;
  const { state, removeTransaction } = useNudgeBudget();
  const [typeFilter, setTypeFilter] = useState<ActivityFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const cat = useMemo(() => new Map(state.categories.map((x) => [x.id, x])), [state.categories]);
  const goalsById = useMemo(() => new Map(state.goals.map((g) => [g.id, g])), [state.goals]);

  const sorted = useMemo(
    () =>
      [...state.transactions].sort(
        (a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime(),
      ),
    [state.transactions],
  );

  const filtered = useMemo(() => {
    let xs = sorted;
    if (typeFilter === "income") xs = xs.filter((t) => t.type === "income");
    if (typeFilter === "expense") xs = xs.filter((t) => t.type === "expense");
    if (categoryFilter !== "all") {
      if (typeFilter === "all") {
        xs = xs.filter(
          (t) =>
            t.type === "income" || String(t.categoryId ?? "") === categoryFilter,
        );
      }
      if (typeFilter === "expense") {
        xs = xs.filter((t) => String(t.categoryId ?? "") === categoryFilter);
      }
    }
    return xs;
  }, [sorted, typeFilter, categoryFilter]);

  const categoryFilterOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const t of sorted) {
      if (t.type === "expense" && t.categoryId) ids.add(t.categoryId);
    }
    return [...ids]
      .map((id) => ({ id, name: cat.get(id)?.name ?? "Uncategorized" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sorted, cat]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <Heading size="6" className="tracking-tight">
            Activity
          </Heading>
          <Text size="2" color="gray" className="mt-2 leading-relaxed">
            Newest first. Filter by type, edit entries, or remove a row with one tap.
          </Text>
        </div>
        <div className="w-full shrink-0 lg:w-auto">
          <AddTransactionDialog
            trigger={
              <Button
                size="3"
                color="gold"
                className="w-full shadow-sm lg:w-auto"
                aria-label="Add income or expense"
              >
                Add transaction
              </Button>
            }
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-gray-600/15 bg-black/[0.02] p-4 dark:bg-white/[0.03] sm:p-5">
        <div>
          <Text size="1" weight="medium" color="gray" className="mb-2 tracking-wide uppercase">
            Type
          </Text>
          <div className="flex flex-wrap gap-2">
            {(["all", "income", "expense"] as ActivityFilter[]).map((key) => (
              <Button
                key={key}
                size="2"
                variant={typeFilter === key ? "solid" : "soft"}
                color={typeFilter === key ? "gold" : "gray"}
                type="button"
                className="rounded-full capitalize"
                onClick={() => {
                  setTypeFilter(key);
                  if (key === "income") setCategoryFilter("all");
                }}
              >
                {key === "all" ? "All" : key}
              </Button>
            ))}
          </div>
        </div>

        {(typeFilter === "all" || typeFilter === "expense") && categoryFilterOptions.length > 0 ? (
          <div>
            <Text size="1" weight="medium" color="gray" className="mb-2 tracking-wide uppercase">
              Category
              {typeFilter === "expense" ? (
                <span className="font-normal lowercase text-gray-600"> expenses</span>
              ) : null}
            </Text>
            <div className="flex flex-wrap gap-2">
              <Button
                size="2"
                variant={categoryFilter === "all" ? "solid" : "soft"}
                color={categoryFilter === "all" ? "gold" : "gray"}
                type="button"
                className="rounded-full"
                onClick={() => setCategoryFilter("all")}
              >
                All categories
              </Button>
              {categoryFilterOptions.map((opt) => (
                <Button
                  key={opt.id}
                  size="2"
                  variant={categoryFilter === opt.id ? "solid" : "soft"}
                  color={categoryFilter === opt.id ? "gold" : "gray"}
                  type="button"
                  className="max-w-[200px] truncate rounded-full sm:max-w-xs"
                  onClick={() => setCategoryFilter(opt.id)}
                >
                  {opt.name}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <EditTransactionDialog
        transaction={editingTx}
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setEditingTx(null);
        }}
      />

      {filtered.length === 0 ? (
        <Card
          size="3"
          variant="surface"
          className="nudge-card-surface border border-dashed border-gray-600/30 px-4 py-10 text-center sm:px-6"
        >
          <Text color="gray" className="leading-relaxed">
            {sorted.length === 0 ? (
              <>
                No transactions yet. Tap <strong className="text-foreground">Add transaction</strong>{" "}
                to start.
              </>
            ) : (
              <>Nothing matches these filters.</>
            )}
          </Text>
        </Card>
      ) : (
        <ul className="flex list-none flex-col gap-3 p-0">
          {filtered.map((t) => {
            const categoryLabel =
              t.type === "income"
                ? "Income"
                : t.goalId
                  ? "Savings goals"
                  : cat.get(t.categoryId ?? "")?.name ?? "Uncategorized";
            const goalLabel = t.goalId
              ? goalsById.get(t.goalId)?.name ?? "Removed goal"
              : undefined;

            const dateLabel = format(parseISO(t.date), "MMM d, yyyy");

            return (
              <li key={t.id}>
                <Card
                  size="3"
                  variant="surface"
                  className="nudge-card-surface overflow-hidden border border-gray-600/15 pl-0 transition-shadow hover:shadow-md dark:border-white/[0.08]"
                >
                  <div className="flex gap-3 pl-0 sm:items-stretch sm:gap-4">
                    <div
                      aria-hidden
                      className={`w-1 shrink-0 rounded-l-[inherit] sm:w-1.5 ${t.type === "income" ? "bg-emerald-500 dark:bg-emerald-400" : ""}`}
                      style={
                        t.type === "expense"
                          ? {
                              backgroundColor: t.goalId
                                ? "#ca8a04"
                                : cat.get(t.categoryId ?? "")?.color ?? "#64748b",
                            }
                          : undefined
                      }
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-4 py-4 pr-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span
                            className={
                              t.type === "income"
                                ? "rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200"
                                : "rounded-full bg-gray-600/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-foreground/80"
                            }
                          >
                            {t.type}
                          </span>
                          <Text size="1" color="gray" className="tabular-nums tracking-wide uppercase">
                            {dateLabel}
                          </Text>
                        </div>
                        <Text size="2" color="gray" className="leading-relaxed wrap-break-word">
                          {categoryLabel}
                          {goalLabel ? (
                            <>
                              {" "}
                              <span className="inline-block max-w-full rounded-md bg-gold-primary/15 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gold-primary align-middle wrap-break-word">
                                Goal · {goalLabel}
                              </span>
                            </>
                          ) : null}
                        </Text>
                        {t.note ? (
                          <Text size="2" className="leading-relaxed wrap-break-word text-foreground/80 line-clamp-4">
                            {t.note}
                          </Text>
                        ) : null}
                      </div>

                      <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:items-end">
                        <Text
                          weight="bold"
                          className="w-full text-left text-xl tabular-nums tracking-tight sm:w-auto sm:text-right sm:text-lg"
                        >
                          {fmt(t.amount)}
                        </Text>
                        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                          <Button
                            size="2"
                            variant="soft"
                            color="gray"
                            className="w-full min-h-10 sm:w-auto"
                            onClick={() => {
                              setEditingTx(t);
                              setEditOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="2"
                            variant="soft"
                            color="red"
                            className="min-h-10 w-full sm:w-auto"
                            onClick={() => removeTransaction(t.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
