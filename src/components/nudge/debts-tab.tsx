"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Callout, Dialog, Progress, SegmentedControl, TextField } from "frosted-ui";
import { NudgeListSkeleton } from "@/components/nudge/content-skeleton";
import { ConfirmButton } from "@/components/nudge/confirm-button";
import { useCurrency } from "@/context/currency-context";
import { nudgeBudgetFetchInit, useNudgeBudget } from "@/context/nudge-budget-context";
import {
  addMonthsIso,
  debtRemaining,
  payoffOrder,
  projectDebtFreeMonths,
  type DebtInput,
  type PayoffStrategy,
} from "@/lib/budget/debt";

type DebtRow = DebtInput & { createdBy: string | null };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/* ── Shared debt form fields (create + edit) ───────────────────── */

function DebtFormFields(props: {
  name: string;
  setName: (v: string) => void;
  balance: string;
  setBalance: (v: string) => void;
  apr: string;
  setApr: (v: string) => void;
  minPayment: string;
  setMinPayment: (v: string) => void;
}) {
  return (
    <div className="mt-6 flex flex-col gap-5">
      <div>
        <span className="eyebrow mb-2 block">Name</span>
        <TextField.Root className="nudge-field w-full">
          <TextField.Input
            placeholder="Visa card"
            autoComplete="off"
            value={props.name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => props.setName(e.target.value)}
          />
        </TextField.Root>
      </div>
      <div>
        <span className="eyebrow mb-2 block">Balance</span>
        <TextField.Root className="nudge-field w-full">
          <TextField.Input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            autoComplete="off"
            value={props.balance}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => props.setBalance(e.target.value)}
          />
        </TextField.Root>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <span className="eyebrow mb-2 block">APR %</span>
          <TextField.Root className="nudge-field w-full">
            <TextField.Input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              autoComplete="off"
              value={props.apr}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => props.setApr(e.target.value)}
            />
          </TextField.Root>
        </div>
        <div>
          <span className="eyebrow mb-2 block">Min payment</span>
          <TextField.Root className="nudge-field w-full">
            <TextField.Input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              autoComplete="off"
              value={props.minPayment}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                props.setMinPayment(e.target.value)
              }
            />
          </TextField.Root>
        </div>
      </div>
    </div>
  );
}

/* ── Per-row inline payment logger ─────────────────────────────── */

function LogPaymentControl(props: { onLog: (displayAmount: number) => void; disabled?: boolean }) {
  const [amount, setAmount] = useState("");
  return (
    <form
      className="flex items-stretch gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const v = Number.parseFloat(amount);
        if (!Number.isFinite(v) || v <= 0) return;
        props.onLog(v);
        setAmount("");
      }}
    >
      <TextField.Root className="nudge-field w-28">
        <TextField.Input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          placeholder="Amount"
          aria-label="Payment amount"
          autoComplete="off"
          value={amount}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)}
        />
      </TextField.Root>
      <Button type="submit" size="2" color="gold" disabled={props.disabled} className="shrink-0">
        Log payment
      </Button>
    </form>
  );
}

export function DebtsTab() {
  const c = useCurrency();
  const fmt = c.formatAmount;
  const { state, addTransaction, whopUserToken } = useNudgeBudget();

  const [debts, setDebts] = useState<DebtRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<PayoffStrategy>("snowball");

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<DebtInput | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Create form
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [apr, setApr] = useState("19.9");
  const [minPayment, setMinPayment] = useState("");

  // Edit form
  const [editName, setEditName] = useState("");
  const [editBalance, setEditBalance] = useState("");
  const [editApr, setEditApr] = useState("");
  const [editMinPayment, setEditMinPayment] = useState("");

  const authedFetch = useCallback(
    (url: string, init?: RequestInit) =>
      fetch(url, nudgeBudgetFetchInit(whopUserToken, { credentials: "include", ...init })),
    [whopUserToken],
  );

  const refetch = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await authedFetch("/api/debts");
      const json = (await res.json().catch(() => ({}))) as { debts?: DebtRow[]; error?: string };
      if (!res.ok) throw new Error(json.error || "Could not load debts.");
      setDebts(json.debts ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load debts.");
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    // Initial load. refetch sets state asynchronously (inside the awaited fetch), not in the
    // synchronous effect body — the react-hooks/set-state-in-effect rule is advisory here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch();
  }, [refetch]);

  function resetCreateForm() {
    setName("");
    setBalance("");
    setApr("19.9");
    setMinPayment("");
    setFormError(null);
  }

  useEffect(() => {
    if (!editOpen || !editing) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditName(editing.name);
    setEditBalance(String(editing.balance));
    setEditApr(String(editing.apr));
    setEditMinPayment(String(editing.minPayment));
    setFormError(null);
  }, [editOpen, editing]);

  async function submitCreate() {
    setSaving(true);
    setFormError(null);
    try {
      const bal = c.parseAmount(balance);
      const min = c.parseAmount(minPayment);
      const rate = Number.parseFloat(apr);
      const res = await authedFetch("/api/debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || "Debt",
          balance: Math.max(0, Number.isFinite(bal) ? bal : 0),
          apr: Math.max(0, Number.isFinite(rate) ? rate : 0),
          minPayment: Math.max(0, Number.isFinite(min) ? min : 0),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok) {
        setFormError(json.error || "Could not add debt.");
        return;
      }
      resetCreateForm();
      setCreateOpen(false);
      await refetch();
    } catch {
      setFormError("Could not add debt.");
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit() {
    if (!editing) return;
    setSaving(true);
    setFormError(null);
    try {
      const bal = c.parseAmount(editBalance);
      const min = c.parseAmount(editMinPayment);
      const rate = Number.parseFloat(editApr);
      const res = await authedFetch("/api/debts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          name: editName.trim() || editing.name,
          balance: Math.max(0, Number.isFinite(bal) ? bal : 0),
          apr: Math.max(0, Number.isFinite(rate) ? rate : 0),
          minPayment: Math.max(0, Number.isFinite(min) ? min : 0),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setFormError(json.error || "Could not save debt.");
        return;
      }
      setEditOpen(false);
      setEditing(null);
      await refetch();
    } catch {
      setFormError("Could not save debt.");
    } finally {
      setSaving(false);
    }
  }

  async function removeDebt(id: string) {
    try {
      const res = await authedFetch(`/api/debts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setLoadError(json.error || "Could not remove debt.");
        return;
      }
      await refetch();
    } catch {
      setLoadError("Could not remove debt.");
    }
  }

  function logPayment(debtId: string, displayAmount: number) {
    const amt = displayAmount;
    if (!Number.isFinite(amt) || amt <= 0) return;
    addTransaction({
      type: "expense",
      amount: Math.max(0, amt),
      categoryId: null,
      goalId: null,
      debtId,
      note: "Debt payment",
      date: todayIso(),
    });
    // addTransaction is optimistic/local; refetch the debt list so its remaining math stays
    // consistent with the persisted ledger.
    void refetch();
  }

  const ordered = useMemo(
    () => payoffOrder(debts, state.transactions, strategy),
    [debts, state.transactions, strategy],
  );

  const totalRemaining = useMemo(
    () => debts.reduce((s, d) => s + debtRemaining(d, state.transactions), 0),
    [debts, state.transactions],
  );

  const months = useMemo(
    () => projectDebtFreeMonths(debts, state.transactions, strategy),
    [debts, state.transactions, strategy],
  );

  const focusId = ordered[0]?.id ?? null;
  const debtFreeLabel = months == null ? "—" : prettyDate(addMonthsIso(todayIso(), months));

  return (
    <div className="flex flex-col gap-8">
      {/* ───── Header ───── */}
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <span className="eyebrow">
            <span className="eyebrow-gold">N°01</span>
            <span aria-hidden style={{ margin: "0 0.5em", color: "var(--ink-faint)" }}>
              —
            </span>
            Liabilities
          </span>
          <h2
            className="heading-display mt-3"
            style={{ color: "var(--ink)", fontSize: "clamp(1.6rem, 3.6vw, 2.15rem)", lineHeight: 1.1 }}
          >
            Debt payoff
          </h2>
          <p className="mt-2 max-w-xl" style={{ color: "var(--ink-muted)", fontSize: "0.95rem", lineHeight: 1.55 }}>
            Track balances and chip away at them. Logging a payment records an expense linked to
            the debt, lowering its remaining balance.
          </p>
        </div>
        <Dialog.Root
          open={createOpen}
          onOpenChange={(o) => {
            setCreateOpen(o);
            if (!o) resetCreateForm();
          }}
        >
          {state.editable ? (
            <Dialog.Trigger>
              <button type="button" className="atelier-btn-gold w-full shrink-0 sm:w-auto">
                <span aria-hidden style={{ fontSize: "1rem", lineHeight: 1 }}>
                  ✦
                </span>
                Add debt
              </button>
            </Dialog.Trigger>
          ) : null}
          <Dialog.Content
            size="3"
            className="max-h-[calc(100dvh-2rem)] max-w-[min(calc(100vw-1.5rem),24rem)] overflow-y-auto overscroll-contain sm:max-w-md"
          >
            <Dialog.Title>Add debt</Dialog.Title>
            <Dialog.Description size="2" color="gray" className="leading-relaxed">
              Enter the current balance, interest rate, and minimum monthly payment.
            </Dialog.Description>

            {formError ? (
              <Callout.Root color="red" size="1" className="mt-4">
                <Callout.Text>{formError}</Callout.Text>
              </Callout.Root>
            ) : null}

            <DebtFormFields
              name={name}
              setName={setName}
              balance={balance}
              setBalance={setBalance}
              apr={apr}
              setApr={setApr}
              minPayment={minPayment}
              setMinPayment={setMinPayment}
            />

            <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Dialog.Close>
                <Button variant="soft" color="gray" size="3" className="w-full sm:w-auto">
                  Cancel
                </Button>
              </Dialog.Close>
              <button
                type="button"
                className="atelier-btn-gold w-full sm:w-auto"
                onClick={submitCreate}
                disabled={saving}
              >
                <span aria-hidden style={{ fontSize: "1rem", lineHeight: 1 }}>
                  ✦
                </span>
                {saving ? "Saving…" : "Add debt"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Root>
      </header>

      {/* ───── Edit dialog ───── */}
      <Dialog.Root
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setEditing(null);
        }}
      >
        <Dialog.Content
          size="3"
          className="max-h-[calc(100dvh-2rem)] max-w-[min(calc(100vw-1.5rem),24rem)] overflow-y-auto overscroll-contain sm:max-w-md"
        >
          <Dialog.Title>Edit debt</Dialog.Title>
          <Dialog.Description size="2" color="gray" className="leading-relaxed">
            Update the balance, rate, or minimum payment. Payments logged stay on the ledger.
          </Dialog.Description>

          {formError ? (
            <Callout.Root color="red" size="1" className="mt-4">
              <Callout.Text>{formError}</Callout.Text>
            </Callout.Root>
          ) : null}

          {editing ? (
            <>
              <DebtFormFields
                name={editName}
                setName={setEditName}
                balance={editBalance}
                setBalance={setEditBalance}
                apr={editApr}
                setApr={setEditApr}
                minPayment={editMinPayment}
                setMinPayment={setEditMinPayment}
              />

              <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Dialog.Close>
                  <Button variant="soft" color="gray" size="3" className="w-full sm:w-auto">
                    Cancel
                  </Button>
                </Dialog.Close>
                <button
                  type="button"
                  className="atelier-btn-gold w-full sm:w-auto"
                  onClick={submitEdit}
                  disabled={saving}
                >
                  <span aria-hidden style={{ fontSize: "1rem", lineHeight: 1 }}>
                    ✦
                  </span>
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Root>

      {loadError ? (
        <Callout.Root color="red" size="1">
          <Callout.Text>{loadError}</Callout.Text>
        </Callout.Root>
      ) : null}

      {/* ───── Summary + strategy ───── */}
      {!loading && debts.length > 0 ? (
        <div className="atelier-card flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:gap-10">
            <div>
              <span className="eyebrow">Total remaining</span>
              <div
                className="heading-display tabular mt-1.5"
                style={{ color: "var(--ink)", fontSize: "1.5rem", fontWeight: 500, letterSpacing: "-0.01em" }}
              >
                {fmt(totalRemaining)}
              </div>
            </div>
            <div>
              <span className="eyebrow">Projected debt-free</span>
              <div
                className="heading-display tabular mt-1.5"
                style={{ color: "var(--ink)", fontSize: "1.5rem", fontWeight: 500, letterSpacing: "-0.01em" }}
              >
                {debtFreeLabel}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="eyebrow">Strategy</span>
            <SegmentedControl.Root
              value={strategy}
              onValueChange={(v) => setStrategy(v as PayoffStrategy)}
            >
              <SegmentedControl.List>
                <SegmentedControl.Trigger value="snowball">Snowball</SegmentedControl.Trigger>
                <SegmentedControl.Trigger value="avalanche">Avalanche</SegmentedControl.Trigger>
              </SegmentedControl.List>
            </SegmentedControl.Root>
          </div>
        </div>
      ) : null}

      {!loading && debts.length > 0 && months == null ? (
        <Callout.Root color="amber" size="1">
          <Callout.Text>
            Minimum payments don&apos;t cover interest — increase a payment to make progress.
          </Callout.Text>
        </Callout.Root>
      ) : null}

      {/* ───── List / empty / loading ───── */}
      {loading ? (
        <NudgeListSkeleton rows={3} />
      ) : debts.length === 0 ? (
        <div
          className="atelier-card px-4 py-10 text-center sm:px-6"
          style={{ borderStyle: "dashed", borderColor: "var(--hairline-strong)" }}
        >
          <p style={{ color: "var(--ink-muted)", lineHeight: 1.6 }}>
            No debts tracked. Tap <strong style={{ color: "var(--ink)" }}>Add debt</strong> to start
            a payoff plan.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {ordered.map((d) => {
            const remaining = debtRemaining(d, state.transactions);
            const paid = Math.max(0, d.balance - remaining);
            const pct = d.balance > 0 ? Math.min(100, (paid / d.balance) * 100) : 0;
            const isFocus = d.id === focusId;
            return (
              <article key={d.id} className="atelier-card atelier-card-interactive p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4
                        className="heading-display min-w-0 wrap-break-word"
                        style={{
                          color: "var(--ink)",
                          fontSize: "1.2rem",
                          lineHeight: 1.2,
                          letterSpacing: "-0.01em",
                        }}
                      >
                        {d.name}
                      </h4>
                      {isFocus ? (
                        <span className="atelier-chip" data-tone="warm">
                          Focus
                        </span>
                      ) : null}
                    </div>
                    <p
                      className="mt-1.5 tabular"
                      style={{ color: "var(--ink-muted)", fontSize: "0.85rem" }}
                    >
                      {d.apr}% APR · Min {fmt(d.minPayment)}/mo
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                    <Button
                      size="2"
                      variant="soft"
                      color="gray"
                      className="min-h-10 flex-1 sm:flex-none"
                      onClick={() => {
                        setEditing(d);
                        setEditOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <ConfirmButton
                      title="Remove debt?"
                      description="This permanently deletes this debt and its balance/APR details."
                      confirmLabel="Remove"
                      onConfirm={() => void removeDebt(d.id)}
                      trigger={
                        <Button
                          size="2"
                          variant="ghost"
                          color="red"
                          className="min-h-10 flex-1 sm:flex-none"
                          aria-label={`Remove debt ${d.name}`}
                        >
                          Remove
                        </Button>
                      }
                    />
                  </div>
                </div>

                <div className="mt-5 space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                    <span className="eyebrow">Remaining</span>
                    <span
                      className="tabular"
                      style={{ color: "var(--ink)", fontWeight: 500, fontSize: "0.92rem" }}
                    >
                      {fmt(remaining)} / {fmt(d.balance)}
                    </span>
                  </div>
                  <Progress value={pct} color="gold" />
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <LogPaymentControl onLog={(amt) => logPayment(d.id, amt)} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
