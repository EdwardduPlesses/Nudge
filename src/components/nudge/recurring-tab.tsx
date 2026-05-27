"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Callout, Select, Switch, Text, TextField } from "frosted-ui";
import { useCurrency } from "@/context/currency-context";
import { nudgeBudgetFetchInit, useNudgeBudget } from "@/context/nudge-budget-context";

type RecurringType = "income" | "expense";

type RecurringItem = {
  id: string;
  type: RecurringType;
  amount: number;
  categoryId: string | null;
  goalId: string | null;
  note: string | null;
  dayOfPeriod: number | null;
  ownerUserId: string | null;
  active: boolean;
};

const NO_CATEGORY = "__none__";

function ItemRow(props: {
  item: RecurringItem;
  categoryName: string | null;
  busy: boolean;
  onToggleActive: (id: string, active: boolean) => void;
  onRemove: (id: string) => void;
}) {
  const c = useCurrency();
  const { item } = props;
  const dayLabel = item.dayOfPeriod == null ? "Period start" : `Day ${item.dayOfPeriod}`;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-600/15 bg-gray-900/3 p-4 dark:bg-white/4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Badge color={item.type === "income" ? "gold" : "gray"} variant="soft">
            {item.type === "income" ? "Income" : "Expense"}
          </Badge>
          <Text size="2" color="gray">
            {dayLabel}
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
          <Button
            type="button"
            variant="soft"
            color="red"
            size="2"
            disabled={props.busy}
            onClick={() => props.onRemove(item.id)}
          >
            Remove
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RecurringTab() {
  const { state, whopUserToken } = useNudgeBudget();
  const c = useCurrency();

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Add form state
  const [type, setType] = useState<RecurringType>("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string>(NO_CATEGORY);
  const [note, setNote] = useState("");
  const [day, setDay] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  function resetForm() {
    setType("expense");
    setAmount("");
    setCategoryId(NO_CATEGORY);
    setNote("");
    setDay("");
    setFormError(null);
  }

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

  async function submit() {
    setFormError(null);
    const amt = c.parseAmount(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setFormError("Enter an amount greater than zero.");
      return;
    }

    let dayOfPeriod: number | undefined;
    if (day.trim()) {
      const d = Number.parseInt(day, 10);
      if (!Number.isInteger(d) || d < 1 || d > 28) {
        setFormError("Day of period must be between 1 and 28.");
        return;
      }
      dayOfPeriod = d;
    }

    const body: {
      type: RecurringType;
      amount: number;
      categoryId?: string;
      note?: string;
      dayOfPeriod?: number;
    } = { type, amount: amt };
    if (type === "expense" && categoryId !== NO_CATEGORY) body.categoryId = categoryId;
    if (note.trim()) body.note = note.trim();
    if (dayOfPeriod != null) body.dayOfPeriod = dayOfPeriod;

    setSubmitting(true);
    try {
      const res = await authedFetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        item?: RecurringItem;
        error?: string;
      };
      if (!res.ok || !json.item) {
        setFormError(json.error || "Could not add recurring item.");
        return;
      }
      resetForm();
      await refetch();
    } catch {
      setFormError("Could not add recurring item.");
    } finally {
      setSubmitting(false);
    }
  }

  const showCategory = type === "expense";

  return (
    <div className="flex flex-col gap-8">
      {/* ───── Header ───── */}
      <header className="min-w-0">
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
          Income and bills that are added automatically at the start of each new budget period.
        </p>
      </header>

      <div className="flex flex-col gap-7">
        {loadError ? (
          <Callout.Root color="red" size="1">
            <Callout.Text>{loadError}</Callout.Text>
          </Callout.Root>
        ) : null}

        {loading ? (
          <Text size="2" color="gray">
            Loading…
          </Text>
        ) : (
          <>
            {/* Existing items */}
            <section className="flex flex-col gap-3">
              <Text size="2" weight="medium" className="block text-foreground/80">
                Your recurring items
              </Text>
              {actionError ? (
                <Callout.Root color="red" size="1">
                  <Callout.Text>{actionError}</Callout.Text>
                </Callout.Root>
              ) : null}
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
                  No recurring items yet. Add one below.
                </Text>
              )}
            </section>

            {/* Add form */}
            <section className="flex flex-col gap-5">
              <Text size="2" weight="medium" className="block text-foreground/80">
                Add recurring item
              </Text>

              {formError ? (
                <Callout.Root color="red" size="1">
                  <Callout.Text>{formError}</Callout.Text>
                </Callout.Root>
              ) : null}

              <form
                className="flex flex-col gap-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <div>
                  <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
                    Type
                  </Text>
                  <Select.Root value={type} onValueChange={(v) => setType(v as RecurringType)}>
                    <Select.Trigger
                      placeholder="Choose type"
                      aria-label="Recurring item type"
                      className="min-h-11 w-full"
                    />
                    <Select.Content>
                      <Select.Item value="expense">Expense</Select.Item>
                      <Select.Item value="income">Income</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </div>

                <div>
                  <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
                    Amount
                  </Text>
                  <TextField.Root className="nudge-field w-full">
                    <TextField.Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={c.currencyCode === "JPY" ? "1" : "any"}
                      enterKeyHint="done"
                      autoComplete="off"
                      placeholder={c.currencyCode === "JPY" ? "0" : "0.00"}
                      value={amount}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setAmount(e.target.value)
                      }
                    />
                  </TextField.Root>
                </div>

                {showCategory && state.categories.length > 0 ? (
                  <div>
                    <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
                      Category <span className="font-normal text-gray-500">(optional)</span>
                    </Text>
                    <Select.Root value={categoryId} onValueChange={setCategoryId}>
                      <Select.Trigger
                        placeholder="No category"
                        aria-label="Recurring item category"
                        className="min-h-11 w-full"
                      />
                      <Select.Content>
                        <Select.Item value={NO_CATEGORY}>No category</Select.Item>
                        {state.categories.map((cat) => (
                          <Select.Item key={cat.id} value={cat.id}>
                            {cat.name}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Root>
                  </div>
                ) : null}

                <div>
                  <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
                    Note <span className="font-normal text-gray-500">(optional)</span>
                  </Text>
                  <TextField.Root className="nudge-field w-full">
                    <TextField.Input
                      placeholder="e.g. rent, salary"
                      autoComplete="off"
                      value={note}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setNote(e.target.value)
                      }
                    />
                  </TextField.Root>
                </div>

                <div>
                  <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
                    Day of period{" "}
                    <span className="font-normal text-gray-500">(optional, 1–28)</span>
                  </Text>
                  <TextField.Root className="nudge-field w-full sm:max-w-32">
                    <TextField.Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={28}
                      step={1}
                      autoComplete="off"
                      placeholder="Period start"
                      value={day}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDay(e.target.value)}
                    />
                  </TextField.Root>
                </div>

                <Button
                  type="submit"
                  size="3"
                  color="gold"
                  disabled={submitting}
                  className="w-full shadow-sm sm:w-auto sm:self-end"
                >
                  {submitting ? "Adding…" : "Add recurring item"}
                </Button>
              </form>
            </section>

            <Text size="1" color="gray" className="leading-relaxed">
              Recurring items are added automatically at the start of each new budget period.
            </Text>
          </>
        )}
      </div>
    </div>
  );
}
