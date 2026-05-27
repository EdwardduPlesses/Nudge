"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Button } from "frosted-ui";
import {
  AddTransactionDialog,
  EditTransactionDialog,
} from "@/components/nudge/add-transaction-dialog";
import { ActivityFeed } from "@/components/nudge/activity-feed";
import { MemberBadge } from "@/components/nudge/member-badge";
import { useCurrency } from "@/context/currency-context";
import { useNudgeBudget } from "@/context/nudge-budget-context";
import { memberLabel, transactionsByActor } from "@/lib/budget/selectors";
import type { Transaction } from "@/lib/budget/types";

type ActivityFilter = "all" | "income" | "expense";

function FilterPill(props: {
  active: boolean;
  label: string;
  onClick: () => void;
  truncate?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={props.truncate ? "max-w-[220px] truncate" : undefined}
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

export function ActivityTab() {
  const c = useCurrency();
  const fmt = c.formatAmount;
  const { state, removeTransaction } = useNudgeBudget();
  const [typeFilter, setTypeFilter] = useState<ActivityFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [whoFilter, setWhoFilter] = useState<string>("all");
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
    if (whoFilter !== "all") {
      xs = transactionsByActor(xs, { mode: "user", userId: whoFilter });
    }
    return xs;
  }, [sorted, typeFilter, categoryFilter, whoFilter]);

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
    <div className="flex flex-col gap-7">
      {/* ───── Header ───── */}
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          <span className="eyebrow">
            <span className="eyebrow-gold">N°01</span>
            <span aria-hidden style={{ margin: "0 0.5em", color: "var(--ink-faint)" }}>
              —
            </span>
            Transactions
          </span>
          <h2
            className="heading-display mt-3"
            style={{ color: "var(--ink)", fontSize: "clamp(1.6rem, 3.6vw, 2.15rem)", lineHeight: 1.1 }}
          >
            Activity
          </h2>
          <p className="mt-2 max-w-md" style={{ color: "var(--ink-muted)", fontSize: "0.95rem", lineHeight: 1.55 }}>
            Newest first. Filter by type, edit entries, or remove a row with one tap.
          </p>
        </div>
        <div className="w-full shrink-0 lg:w-auto">
          <AddTransactionDialog
            trigger={
              <button
                type="button"
                className="atelier-btn-gold w-full lg:w-auto"
                aria-label="Add income or expense"
              >
                <span aria-hidden style={{ fontSize: "1rem", lineHeight: 1 }}>
                  ✦
                </span>
                Add transaction
              </button>
            }
          />
        </div>
      </header>

      {/* ───── Filter bar ───── */}
      <div className="atelier-card p-4 sm:p-5">
        <div className="flex flex-col gap-4">
          <div>
            <span className="eyebrow mb-2 block">Type</span>
            <div className="flex flex-wrap gap-2">
              {(["all", "income", "expense"] as ActivityFilter[]).map((key) => (
                <FilterPill
                  key={key}
                  active={typeFilter === key}
                  label={key === "all" ? "All" : key.charAt(0).toUpperCase() + key.slice(1)}
                  onClick={() => {
                    setTypeFilter(key);
                    if (key === "income") setCategoryFilter("all");
                  }}
                />
              ))}
            </div>
          </div>

          {(typeFilter === "all" || typeFilter === "expense") &&
          categoryFilterOptions.length > 0 ? (
            <div>
              <span className="eyebrow mb-2 block">Category</span>
              <div className="flex flex-wrap gap-2">
                <FilterPill
                  active={categoryFilter === "all"}
                  label="All categories"
                  onClick={() => setCategoryFilter("all")}
                />
                {categoryFilterOptions.map((opt) => (
                  <FilterPill
                    key={opt.id}
                    active={categoryFilter === opt.id}
                    label={opt.name}
                    truncate
                    onClick={() => setCategoryFilter(opt.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {state.members.length >= 2 ? (
            <div>
              <span className="eyebrow mb-2 block">Who</span>
              <div className="flex flex-wrap gap-2">
                <FilterPill
                  active={whoFilter === "all"}
                  label="All"
                  onClick={() => setWhoFilter("all")}
                />
                {state.members.map((m) => (
                  <FilterPill
                    key={m.whopUserId}
                    active={whoFilter === m.whopUserId}
                    label={memberLabel(state.members, m.whopUserId)}
                    truncate
                    onClick={() => setWhoFilter(m.whopUserId)}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <EditTransactionDialog
        transaction={editingTx}
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setEditingTx(null);
        }}
      />

      {/* ───── Recent changes ───── */}
      <section aria-label="Recent changes" className="atelier-card p-4 sm:p-5">
        <span className="eyebrow mb-3 block">Recent changes</span>
        <ActivityFeed filterUserId={whoFilter === "all" ? undefined : whoFilter} />
      </section>

      {/* ───── List ───── */}
      {filtered.length === 0 ? (
        <div
          className="atelier-card px-4 py-10 text-center sm:px-6"
          style={{ borderStyle: "dashed", borderColor: "var(--hairline-strong)" }}
        >
          <p style={{ color: "var(--ink-muted)", lineHeight: 1.6 }}>
            {sorted.length === 0 ? (
              <>
                No transactions yet. Tap{" "}
                <strong style={{ color: "var(--ink)" }}>Add transaction</strong> to start.
              </>
            ) : (
              <>Nothing matches these filters.</>
            )}
          </p>
        </div>
      ) : (
        <ul className="flex list-none flex-col gap-2.5 p-0">
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
            const accentColor =
              t.type === "income"
                ? "var(--tone-success)"
                : t.goalId
                  ? "var(--gold)"
                  : cat.get(t.categoryId ?? "")?.color ?? "var(--ink-faint)";

            return (
              <li key={t.id}>
                <article className="atelier-card atelier-card-interactive overflow-hidden">
                  <div className="flex gap-3 sm:items-stretch sm:gap-4">
                    <div
                      aria-hidden
                      className="w-[3px] shrink-0 rounded-l-[inherit] sm:w-1"
                      style={{ backgroundColor: accentColor }}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-4 py-4 pr-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                          <span
                            className="atelier-chip"
                            data-tone={t.type === "income" ? "success" : undefined}
                            style={{ textTransform: "uppercase" }}
                          >
                            {t.type}
                          </span>
                          <span
                            className="tabular"
                            style={{
                              color: "var(--ink-muted)",
                              fontSize: 11,
                              letterSpacing: "0.1em",
                              textTransform: "uppercase",
                            }}
                          >
                            {dateLabel}
                          </span>
                          <MemberBadge userId={t.createdBy} />
                        </div>
                        <p
                          className="wrap-break-word"
                          style={{ color: "var(--ink-soft)", fontSize: "0.9rem", lineHeight: 1.55 }}
                        >
                          {categoryLabel}
                          {goalLabel ? (
                            <>
                              {" "}
                              <span
                                className="atelier-chip ml-1 align-middle"
                                data-tone="gold"
                                style={{ textTransform: "none", letterSpacing: "0.02em" }}
                              >
                                Goal · {goalLabel}
                              </span>
                            </>
                          ) : null}
                        </p>
                        {t.note ? (
                          <p
                            className="wrap-break-word line-clamp-4"
                            style={{ color: "var(--ink)", fontSize: "0.9rem", lineHeight: 1.55 }}
                          >
                            {t.note}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:items-end">
                        <span
                          className="heading-display tabular w-full text-left sm:w-auto sm:text-right"
                          style={{
                            color: "var(--ink)",
                            fontSize: "1.35rem",
                            fontWeight: 500,
                            letterSpacing: "-0.01em",
                            lineHeight: 1.1,
                          }}
                        >
                          {fmt(t.amount)}
                        </span>
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
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
