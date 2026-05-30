"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Callout, Switch, Text } from "frosted-ui";
import { NudgeListSkeleton } from "@/components/nudge/content-skeleton";
import { ConfirmButton } from "@/components/nudge/confirm-button";
import { AddRecurringDialog } from "@/components/nudge/add-recurring-dialog";
import { useCurrency } from "@/context/currency-context";
import { nudgeBudgetFetchInit, useNudgeBudget } from "@/context/nudge-budget-context";

type RecurringType = "income" | "expense";
type RecurringTiming = "start" | "end";

type RecurringItem = {
  id: string;
  type: RecurringType;
  amount: number;
  categoryId: string | null;
  goalId: string | null;
  note: string | null;
  timing: RecurringTiming;
  ownerUserId: string | null;
  active: boolean;
};

function ItemRow(props: {
  item: RecurringItem;
  categoryName: string | null;
  busy: boolean;
  onToggleActive: (id: string, active: boolean) => void;
  onRemove: (id: string) => void;
}) {
  const c = useCurrency();
  const { item } = props;
  const timingLabel = item.timing === "end" ? "Period end" : "Period start";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-600/15 bg-gray-900/3 p-4 dark:bg-white/4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Badge color={item.type === "income" ? "gold" : "gray"} variant="soft">
            {item.type === "income" ? "Income" : "Expense"}
          </Badge>
          <Text size="2" color="gray">
            {timingLabel}
          </Text>
          {props.categoryName ? (
            <Text size="2" color="gray" className="truncate">
              {props.categoryName}
            </Text>
          ) : null}
        </div>
        {item.note ? (
          <p className="text-sm wrap-break-word text-foreground/80 line-clamp-3">{item.note}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col gap-3 sm:items-end">
        <p className="text-right text-lg font-bold tabular-nums tracking-tight">
          {c.formatAmount(item.amount)}
        </p>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2">
            <Switch
              size="2"
              color="gold"
              checked={item.active}
              disabled={props.busy}
              onCheckedChange={(v) => props.onToggleActive(item.id, v)}
            />
            <Text size="1" color="gray">
              {item.active ? "Active" : "Paused"}
            </Text>
          </label>
          <ConfirmButton
            title="Remove recurring item?"
            description="This stops it from being added to future periods."
            confirmLabel="Remove"
            onConfirm={() => props.onRemove(item.id)}
            trigger={
              <Button type="button" variant="soft" color="red" size="2" disabled={props.busy}>
                Remove
              </Button>
            }
          />
        </div>
      </div>
    </div>
  );
}

export function RecurringTab() {
  const { state, whopUserToken, refresh } = useNudgeBudget();

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  const categoryName = useMemo(() => {
    const map = new Map(state.categories.map((cat) => [cat.id, cat.name]));
    return (id: string | null) => (id ? map.get(id) ?? null : null);
  }, [state.categories]);

  const authedFetch = useCallback(
    (url: string, init?: RequestInit) =>
      fetch(url, nudgeBudgetFetchInit(whopUserToken, { credentials: "include", ...init })),
    [whopUserToken],
  );

  const refetch = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await authedFetch("/api/recurring");
      const json = (await res.json().catch(() => ({}))) as {
        items?: RecurringItem[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Could not load recurring items.");
      setItems(json.items ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load recurring items.");
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  // Load on mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch();
  }, [refetch]);

  async function toggleActive(id: string, active: boolean) {
    setBusyId(id);
    setActionError(null);
    // Optimistic flip for responsiveness; reverted on failure.
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, active } : it)));
    try {
      const res = await authedFetch("/api/recurring", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, active }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, active: !active } : it)));
        setActionError(json.error || "Could not update item.");
      }
    } catch {
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, active: !active } : it)));
      setActionError("Could not update item.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeItem(id: string) {
    setBusyId(id);
    setActionError(null);
    try {
      const res = await authedFetch(`/api/recurring?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setActionError(json.error || "Could not remove item.");
        return;
      }
      await refetch();
    } catch {
      setActionError("Could not remove item.");
    } finally {
      setBusyId(null);
    }
  }

  async function applyToPeriod() {
    setApplying(true);
    setApplyMsg(null);
    setActionError(null);
    try {
      const res = await authedFetch("/api/recurring/apply", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { added?: number; error?: string };
      if (!res.ok) {
        setActionError(json.error || "Could not apply recurring items.");
        return;
      }
      const n = json.added ?? 0;
      setApplyMsg(n > 0 ? `Added ${n} item${n === 1 ? "" : "s"} to this period.` : "Already up to date.");
      if (n > 0) await refresh();
    } catch {
      setActionError("Could not apply recurring items.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ───── Header ───── */}
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          <span className="eyebrow">
            <span className="eyebrow-gold">N°03</span>
            <span aria-hidden style={{ margin: "0 0.5em", color: "var(--ink-faint)" }}>
              —
            </span>
            Recurring
          </span>
          <h2
            className="heading-display mt-3"
            style={{ color: "var(--ink)", fontSize: "clamp(1.6rem, 3.6vw, 2.15rem)", lineHeight: 1.1 }}
          >
            Recurring
          </h2>
          <p className="mt-2 max-w-prose" style={{ color: "var(--ink-muted)", fontSize: "0.95rem", lineHeight: 1.55 }}>
            Income and bills that are added automatically to each new budget period.
          </p>
        </div>
        {state.editable ? (
          <div className="flex w-full shrink-0 flex-col gap-2 sm:flex-row lg:w-auto">
            <Button
              type="button"
              variant="soft"
              color="gray"
              size="3"
              disabled={applying}
              className="w-full sm:w-auto"
              onClick={() => void applyToPeriod()}
            >
              {applying ? "Adding…" : "Add to this period"}
            </Button>
            <AddRecurringDialog
              onAdded={() => void refetch()}
              trigger={
                <button type="button" className="atelier-btn-gold w-full sm:w-auto" aria-label="Add recurring item">
                  <span aria-hidden style={{ fontSize: "1rem", lineHeight: 1 }}>
                    ✦
                  </span>
                  Add item
                </button>
              }
            />
          </div>
        ) : null}
      </header>

      <div className="flex flex-col gap-7">
        {loadError ? (
          <Callout.Root color="red" size="1">
            <Callout.Text>{loadError}</Callout.Text>
          </Callout.Root>
        ) : null}
        {applyMsg ? (
          <Callout.Root color="gray" size="1">
            <Callout.Text>{applyMsg}</Callout.Text>
          </Callout.Root>
        ) : null}
        {actionError ? (
          <Callout.Root color="red" size="1">
            <Callout.Text>{actionError}</Callout.Text>
          </Callout.Root>
        ) : null}

        {loading ? (
          <NudgeListSkeleton rows={3} />
        ) : (
          <section className="flex flex-col gap-3">
            <Text size="2" weight="medium" className="block text-foreground/80">
              Your recurring items
            </Text>
            {items.length > 0 ? (
              items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  categoryName={categoryName(item.categoryId)}
                  busy={busyId === item.id}
                  onToggleActive={(id, active) => void toggleActive(id, active)}
                  onRemove={(id) => void removeItem(id)}
                />
              ))
            ) : (
              <Text size="2" color="gray" className="leading-relaxed">
                No recurring items yet. Tap &ldquo;Add item&rdquo; to create one.
              </Text>
            )}
          </section>
        )}

        <Text size="1" color="gray" className="leading-relaxed">
          New items are added to future periods automatically. To pull them into the current period now, tap &ldquo;Add to this period&rdquo;.
        </Text>
      </div>
    </div>
  );
}
