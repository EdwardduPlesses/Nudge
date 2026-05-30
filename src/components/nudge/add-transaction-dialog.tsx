"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Button, Dialog, RadioGroup, Select, Text, TextField } from "frosted-ui";
import { NudgeDatePicker } from "@/components/nudge/nudge-date-picker";
import { useCurrency } from "@/context/currency-context";
import { nudgeBudgetFetchInit, useNudgeBudget } from "@/context/nudge-budget-context";
import type { Transaction } from "@/lib/budget/types";

/** Fetch the workbook's debts for the Debt-payment option (debts live outside budget state). */
function useDebtOptions(open: boolean, whopUserToken: string | null): DebtOption[] {
  const [debts, setDebts] = useState<DebtOption[]>([]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/debts", nudgeBudgetFetchInit(whopUserToken, { credentials: "include" }));
        if (!res.ok) return;
        const data = (await res.json()) as { debts?: { id: string; name: string }[] };
        if (!cancelled) setDebts((data.debts ?? []).map((d) => ({ value: d.id, label: d.name || "Debt" })));
      } catch {
        /* leave empty — the Debt option just won't appear */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, whopUserToken]);
  return debts;
}

type TransactionEntryType = "expense" | "income" | "goal" | "debt";
type GoalFlow = "to_goal" | "from_goal";

type DebtOption = { value: string; label: string };

function transactionDateIsoUtc(dateStr: string): string {
  const t = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t}T12:00:00.000Z`;
  return `${format(new Date(), "yyyy-MM-dd")}T12:00:00.000Z`;
}

function TxnFormFields(props: {
  amount: string;
  setAmount: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  entryType: TransactionEntryType;
  setEntryType: (v: TransactionEntryType) => void;
  goalFlow: GoalFlow;
  setGoalFlow: (v: GoalFlow) => void;
  categoryId: string;
  setCategoryId: (v: string) => void;
  date: string;
  setDate: (v: string) => void;
  categoryOptions: { value: string; label: string }[];
  goalOptions: { value: string; label: string }[];
  goalId: string;
  setGoalId: (v: string) => void;
  debtId: string;
  setDebtId: (v: string) => void;
  debtOptions: DebtOption[];
  jpy: boolean;
  amountError?: string | null;
}) {
  const showCategory = props.entryType === "expense";

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div>
        <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
          Type
        </Text>
        <RadioGroup.Root
          value={props.entryType}
          onValueChange={(v) => props.setEntryType(v as TransactionEntryType)}
        >
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <label
              className="flex min-h-11 min-w-[calc(33%-0.375rem)] flex-1 cursor-pointer items-center gap-2.5 rounded-xl border border-gray-600/15 bg-gray-900/3 px-3 py-2.5 dark:bg-white/4 sm:min-w-0 sm:flex-none"
            >
              <RadioGroup.Item value="expense" />
              <Text size="2">Expense</Text>
            </label>
            <label
              className="flex min-h-11 min-w-[calc(33%-0.375rem)] flex-1 cursor-pointer items-center gap-2.5 rounded-xl border border-gray-600/15 bg-gray-900/3 px-3 py-2.5 dark:bg-white/4 sm:min-w-0 sm:flex-none"
            >
              <RadioGroup.Item value="income" />
              <Text size="2">Income</Text>
            </label>
            {props.goalOptions.length > 0 ? (
              <label
                className="flex min-h-11 min-w-[calc(33%-0.375rem)] flex-1 cursor-pointer items-center gap-2.5 rounded-xl border border-gray-600/15 bg-gray-900/3 px-3 py-2.5 dark:bg-white/4 sm:min-w-0 sm:flex-none"
              >
                <RadioGroup.Item value="goal" />
                <Text size="2">Goal</Text>
              </label>
            ) : null}
            {props.debtOptions.length > 0 ? (
              <label
                className="flex min-h-11 min-w-[calc(33%-0.375rem)] flex-1 cursor-pointer items-center gap-2.5 rounded-xl border border-gray-600/15 bg-gray-900/3 px-3 py-2.5 dark:bg-white/4 sm:min-w-0 sm:flex-none"
              >
                <RadioGroup.Item value="debt" />
                <Text size="2">Debt payment</Text>
              </label>
            ) : null}
          </div>
        </RadioGroup.Root>
      </div>

      {props.entryType === "debt" ? (
        <div>
          <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
            Debt
          </Text>
          <Select.Root value={props.debtId || props.debtOptions[0]?.value} onValueChange={props.setDebtId}>
            <Select.Trigger placeholder="Choose debt" aria-label="Debt" className="min-h-11 w-full" />
            <Select.Content>
              {props.debtOptions.map((opt) => (
                <Select.Item key={opt.value} value={opt.value}>
                  {opt.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          <Text size="1" color="gray" className="mt-2 leading-snug">
            Logged as an expense that reduces this debt&apos;s remaining balance.
          </Text>
        </div>
      ) : null}

      {props.entryType === "goal" ? (
        <div>
          <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
            Goal action
          </Text>
          <RadioGroup.Root
            value={props.goalFlow}
            onValueChange={(v) => props.setGoalFlow(v as GoalFlow)}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              <label
                className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-gray-600/15 bg-gray-900/3 px-3 py-2.5 dark:bg-white/4"
              >
                <RadioGroup.Item value="to_goal" />
                <Text size="2">Add to goal</Text>
              </label>
              <label
                className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-gray-600/15 bg-gray-900/3 px-3 py-2.5 dark:bg-white/4"
              >
                <RadioGroup.Item value="from_goal" />
                <Text size="2">Withdraw from goal</Text>
              </label>
            </div>
          </RadioGroup.Root>
          <Text size="1" color="gray" className="mt-2 leading-snug">
            {props.goalFlow === "to_goal"
              ? "Moves cash into savings—shown separately from categories like Housing or Food."
              : "Logged as income and decreases the goal balance."}
          </Text>
        </div>
      ) : null}

      <NudgeDatePicker label="Date" ariaLabel="Transaction date" value={props.date} onChange={props.setDate} />

      <div>
        <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
          Amount
        </Text>
        <TextField.Root className="nudge-field w-full">
          <TextField.Input
            type="number"
            inputMode="decimal"
            min={0}
            step={props.jpy ? "1" : "any"}
            enterKeyHint="done"
            autoComplete="off"
            placeholder={props.jpy ? "0" : "0.00"}
            aria-label="Amount"
            aria-invalid={props.amountError != null}
            aria-describedby={props.amountError ? "txn-amount-error" : undefined}
            value={props.amount}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => props.setAmount(e.target.value)}
          />
        </TextField.Root>
        {props.amountError ? (
          <Text id="txn-amount-error" size="2" color="red" className="mt-2 block">
            {props.amountError}
          </Text>
        ) : null}
      </div>

      {props.entryType === "goal" && props.goalOptions.length > 0 ? (
        <div>
          <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
            Goal
          </Text>
          <Select.Root value={props.goalId || props.goalOptions[0]?.value} onValueChange={props.setGoalId}>
            <Select.Trigger placeholder="Choose goal" className="min-h-11 w-full" />
            <Select.Content>
              {props.goalOptions.map((opt) => (
                <Select.Item key={opt.value} value={opt.value}>
                  {opt.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </div>
      ) : null}

      {showCategory && props.categoryOptions.length > 0 ? (
        <div>
          <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
            Category
          </Text>
          <Select.Root value={props.categoryId} onValueChange={props.setCategoryId}>
            <Select.Trigger placeholder="Choose category" className="min-h-11 w-full" />
            <Select.Content>
              {props.categoryOptions.map((opt) => (
                <Select.Item key={opt.value} value={opt.value}>
                  {opt.label}
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
            placeholder="e.g. groceries, paycheck"
            autoComplete="off"
            aria-label="Note"
            value={props.note}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => props.setNote(e.target.value)}
          />
        </TextField.Root>
      </div>
    </div>
  );
}

export function AddTransactionDialog(props: { trigger: React.ReactNode }) {
  const { state, addTransaction, whopUserToken } = useNudgeBudget();
  const c = useCurrency();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [entryType, setEntryType] = useState<TransactionEntryType>("expense");
  const [goalFlow, setGoalFlow] = useState<GoalFlow>("to_goal");
  const [categoryId, setCategoryId] = useState<string>(state.categories[0]?.id ?? "");
  const [goalId, setGoalId] = useState("");
  const [debtId, setDebtId] = useState("");
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const debtOptions = useDebtOptions(open, whopUserToken);

  const categoryOptions = useMemo(
    () =>
      state.categories.map((cat) => ({
        value: cat.id,
        label: cat.name,
      })),
    [state.categories],
  );

  const goalOptions = useMemo(
    () =>
      state.goals.map((g) => ({
        value: g.id,
        label: g.name,
      })),
    [state.goals],
  );

  useEffect(() => {
    if (!open) return;
    const first = state.categories[0]?.id ?? "";
    if (!categoryId && first) setCategoryId(first);
  }, [open, categoryId, state.categories]);

  useEffect(() => {
    if (entryType !== "goal" || goalOptions.length === 0) return;
    if (!goalId || !goalOptions.some((g) => g.value === goalId)) {
      setGoalId(goalOptions[0]?.value ?? "");
    }
  }, [entryType, goalId, goalOptions]);

  function reset() {
    setAmount("");
    setAmountError(null);
    setNote("");
    setEntryType("expense");
    setGoalFlow("to_goal");
    setCategoryId(state.categories[0]?.id ?? "");
    setGoalId(goalOptions[0]?.value ?? "");
    setDebtId("");
    setDate(format(new Date(), "yyyy-MM-dd"));
  }

  function handleEntryType(next: TransactionEntryType) {
    setEntryType(next);
    if (next === "goal" && goalOptions.length > 0) {
      setGoalId(goalOptions[0]?.value ?? "");
    }
    if (next !== "goal") {
      setGoalId("");
    }
  }

  function submit() {
    const amt = c.parseAmount(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setAmountError("Enter a valid amount");
      return;
    }

    let type: "income" | "expense";
    let cat: string | null = null;
    let gid: string | null = null;
    let did: string | null = null;

    if (entryType === "goal") {
      const pick = goalId.trim() || goalOptions[0]?.value || "";
      if (!pick) {
        setAmountError("Add a savings goal first");
        return;
      }
      gid = pick;
      type = goalFlow === "to_goal" ? "expense" : "income";
    } else if (entryType === "debt") {
      const pick = debtId.trim() || debtOptions[0]?.value || "";
      if (!pick) {
        setAmountError("Add a debt under Money goals → Debts first");
        return;
      }
      did = pick;
      type = "expense";
    } else if (entryType === "income") {
      type = "income";
    } else {
      type = "expense";
      cat = categoryId || state.categories[0]?.id || null;
      if (!cat) {
        setAmountError("Add a category under Budgets first");
        return;
      }
    }

    addTransaction({
      date: transactionDateIsoUtc(date),
      amount: amt,
      type,
      categoryId: cat,
      goalId: gid,
      debtId: did,
      note: note.trim() || (entryType === "debt" ? "Debt payment" : ""),
    });
    reset();
    setOpen(false);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <Dialog.Trigger>{props.trigger}</Dialog.Trigger>
      <Dialog.Content
        size="3"
        className="max-h-[calc(100dvh-2rem)] max-w-[min(calc(100vw-1.5rem),24rem)] overflow-y-auto overscroll-contain sm:max-w-md"
      >
        <Dialog.Title>Add transaction</Dialog.Title>
        <Dialog.Description size="2" color="gray" className="leading-relaxed">
          Income, expenses, or goal transfers.
        </Dialog.Description>

        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <TxnFormFields
            amount={amount}
            setAmount={setAmount}
            note={note}
            setNote={setNote}
            entryType={entryType}
            setEntryType={handleEntryType}
            goalFlow={goalFlow}
            setGoalFlow={setGoalFlow}
            categoryId={categoryId}
            setCategoryId={setCategoryId}
            date={date}
            setDate={setDate}
            categoryOptions={categoryOptions}
            goalOptions={goalOptions}
            goalId={goalId}
            setGoalId={setGoalId}
            debtId={debtId}
            setDebtId={setDebtId}
            debtOptions={debtOptions}
            jpy={c.currencyCode === "JPY"}
            amountError={amountError}
          />

          <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close>
              <Button type="button" variant="soft" color="gray" size="3" className="w-full sm:w-auto">
                Cancel
              </Button>
            </Dialog.Close>
            <Button type="submit" size="3" color="gold" className="w-full shadow-sm sm:w-auto">
              Save transaction
            </Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}

export function EditTransactionDialog(props: {
  transaction: Transaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { state, updateTransaction, whopUserToken } = useNudgeBudget();
  const c = useCurrency();
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [entryType, setEntryType] = useState<TransactionEntryType>("expense");
  const [goalFlow, setGoalFlow] = useState<GoalFlow>("to_goal");
  const [categoryId, setCategoryId] = useState("");
  const [goalId, setGoalId] = useState("");
  const [debtId, setDebtId] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [recurringStatus, setRecurringStatus] = useState<"idle" | "saving" | "done">("idle");
  const fetchedDebtOptions = useDebtOptions(props.open, whopUserToken);

  const categoryOptions = useMemo(
    () =>
      state.categories.map((cat) => ({
        value: cat.id,
        label: cat.name,
      })),
    [state.categories],
  );

  const tx = props.transaction;

  const goalOptions = useMemo(() => {
    const base = state.goals.map((g) => ({
      value: g.id,
      label: g.name,
    }));
    const gid = tx?.goalId;
    if (gid && !base.some((o) => o.value === gid)) {
      return [...base, { value: gid, label: "Removed goal (clear or keep link)" }];
    }
    return base;
  }, [state.goals, tx?.goalId]);

  // Keep the current row's debt selectable even if it was deleted from the list.
  const debtOptions = useMemo(() => {
    const base = [...fetchedDebtOptions];
    const did = tx?.debtId;
    if (did && !base.some((o) => o.value === did)) {
      return [...base, { value: did, label: "Linked debt" }];
    }
    return base;
  }, [fetchedDebtOptions, tx?.debtId]);

  useEffect(() => {
    if (!props.open || !tx) return;
    const fb = state.categories[0]?.id ?? "";
    setAmount(String(tx.amount));
    setAmountError(null);
    setRecurringStatus("idle");
    setNote(tx.note);
    setDate(format(parseISO(tx.date), "yyyy-MM-dd"));

    if (tx.debtId) {
      setEntryType("debt");
      setDebtId(tx.debtId);
      setGoalFlow("to_goal");
      setGoalId("");
      setCategoryId(tx.categoryId ?? fb);
    } else if (tx.goalId) {
      setEntryType("goal");
      setGoalFlow(tx.type === "expense" ? "to_goal" : "from_goal");
      setGoalId(tx.goalId);
      setCategoryId(tx.categoryId ?? fb);
    } else {
      setEntryType(tx.type);
      setGoalFlow("to_goal");
      setGoalId("");
      setCategoryId(tx.categoryId ?? fb);
    }
  }, [props.open, tx, state.categories]);

  function handleEntryType(next: TransactionEntryType) {
    setEntryType(next);
    if (next === "goal" && goalOptions.length > 0) {
      const pick =
        goalId && goalOptions.some((g) => g.value === goalId)
          ? goalId
          : goalOptions[0]?.value ?? "";
      setGoalId(pick);
    }
    if (next !== "goal") {
      setGoalId("");
    }
    if (next === "debt") {
      setDebtId((prev) => prev || debtOptions[0]?.value || "");
    }
  }

  useEffect(() => {
    if (entryType !== "goal" || goalOptions.length === 0) return;
    if (!goalId || !goalOptions.some((g) => g.value === goalId)) {
      setGoalId(goalOptions[0]?.value ?? "");
    }
  }, [entryType, goalId, goalOptions]);

  async function makeRecurring() {
    const amt = c.parseAmount(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setAmountError("Enter a valid amount");
      return;
    }
    const body: {
      type: "income" | "expense";
      amount: number;
      timing: "start";
      categoryId?: string;
      note?: string;
    } = {
      type: entryType === "income" ? "income" : "expense",
      amount: amt,
      timing: "start",
    };
    if (entryType === "expense" && categoryId) body.categoryId = categoryId;
    if (note.trim()) body.note = note.trim();

    setAmountError(null);
    setRecurringStatus("saving");
    try {
      const res = await fetch(
        "/api/recurring",
        nudgeBudgetFetchInit(whopUserToken, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      setRecurringStatus(res.ok ? "done" : "idle");
      if (!res.ok) setAmountError("Could not make this recurring.");
    } catch {
      setRecurringStatus("idle");
      setAmountError("Could not make this recurring.");
    }
  }

  function submit() {
    if (!tx) return;
    const amt = c.parseAmount(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setAmountError("Enter a valid amount");
      return;
    }

    let type: "income" | "expense";
    let cat: string | null = null;
    let gid: string | null = null;
    let did: string | null = null;

    if (entryType === "goal") {
      const pick = goalId.trim() || goalOptions[0]?.value || "";
      if (!pick) {
        setAmountError("Add a savings goal first");
        return;
      }
      gid = pick;
      type = goalFlow === "to_goal" ? "expense" : "income";
    } else if (entryType === "debt") {
      const pick = debtId.trim() || debtOptions[0]?.value || "";
      if (!pick) {
        setAmountError("Add a debt under Money goals → Debts first");
        return;
      }
      did = pick;
      type = "expense";
    } else if (entryType === "income") {
      type = "income";
    } else {
      type = "expense";
      cat = categoryId || state.categories[0]?.id || null;
      if (!cat) {
        setAmountError("Add a category under Budgets first");
        return;
      }
    }

    updateTransaction(tx.id, {
      date: transactionDateIsoUtc(date),
      amount: amt,
      type,
      categoryId: cat,
      goalId: gid,
      debtId: did,
      note: note.trim(),
    });
    props.onOpenChange(false);
  }

  if (!tx) return null;

  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Content
        size="3"
        className="max-h-[calc(100dvh-2rem)] max-w-[min(calc(100vw-1.5rem),24rem)] overflow-y-auto overscroll-contain sm:max-w-md"
      >
        <Dialog.Title>Edit transaction</Dialog.Title>
        <Dialog.Description size="2" color="gray" className="leading-relaxed">
          Update this entry.
        </Dialog.Description>

        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <TxnFormFields
            amount={amount}
            setAmount={setAmount}
            note={note}
            setNote={setNote}
            entryType={entryType}
            setEntryType={handleEntryType}
            goalFlow={goalFlow}
            setGoalFlow={setGoalFlow}
            categoryId={categoryId}
            setCategoryId={setCategoryId}
            date={date}
            setDate={setDate}
            categoryOptions={categoryOptions}
            goalOptions={goalOptions}
            goalId={goalId}
            setGoalId={setGoalId}
            debtId={debtId}
            setDebtId={setDebtId}
            debtOptions={debtOptions}
            jpy={c.currencyCode === "JPY"}
            amountError={amountError}
          />

          {entryType === "income" || entryType === "expense" ? (
            <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-gray-600/15 bg-gray-900/3 p-3 dark:bg-white/4">
              <div className="min-w-0">
                <Text size="2" weight="medium" className="block text-foreground/80">
                  Repeat every period
                </Text>
                <Text size="1" color="gray" className="leading-snug">
                  Adds this as a recurring item at the start of each period.
                </Text>
              </div>
              {recurringStatus === "done" ? (
                <Text size="2" color="green" className="shrink-0">
                  Added to Recurring ✓
                </Text>
              ) : (
                <Button
                  type="button"
                  variant="soft"
                  color="gold"
                  size="2"
                  disabled={recurringStatus === "saving"}
                  className="shrink-0"
                  onClick={() => void makeRecurring()}
                >
                  {recurringStatus === "saving" ? "Adding…" : "Make recurring"}
                </Button>
              )}
            </div>
          ) : null}

          <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close>
              <Button type="button" variant="soft" color="gray" size="3" className="w-full sm:w-auto">
                Cancel
              </Button>
            </Dialog.Close>
            <Button type="submit" size="3" color="gold" className="w-full shadow-sm sm:w-auto">
              Save changes
            </Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}
