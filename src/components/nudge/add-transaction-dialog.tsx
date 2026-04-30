"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Button, Dialog, RadioGroup, Select, Text, TextField } from "frosted-ui";
import { NudgeDatePicker } from "@/components/nudge/nudge-date-picker";
import { useCurrency } from "@/context/currency-context";
import { useNudgeBudget } from "@/context/nudge-budget-context";
import type { Transaction } from "@/lib/budget/types";

type TransactionEntryType = "expense" | "income" | "goal";
type GoalFlow = "to_goal" | "from_goal";

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
  amountApproxLabel: string;
  currency: string;
  rateLoading: boolean;
  jpy: boolean;
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
          </div>
        </RadioGroup.Root>
      </div>

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
          Amount {props.amountApproxLabel}
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
            value={props.amount}
            disabled={props.currency !== "USD" && props.rateLoading}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => props.setAmount(e.target.value)}
          />
        </TextField.Root>
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
            value={props.note}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => props.setNote(e.target.value)}
          />
        </TextField.Root>
      </div>
    </div>
  );
}

export function AddTransactionDialog(props: { trigger: React.ReactNode }) {
  const { state, addTransaction } = useNudgeBudget();
  const c = useCurrency();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [entryType, setEntryType] = useState<TransactionEntryType>("expense");
  const [goalFlow, setGoalFlow] = useState<GoalFlow>("to_goal");
  const [categoryId, setCategoryId] = useState<string>(state.categories[0]?.id ?? "");
  const [goalId, setGoalId] = useState("");
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

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
    setNote("");
    setEntryType("expense");
    setGoalFlow("to_goal");
    setCategoryId(state.categories[0]?.id ?? "");
    setGoalId(goalOptions[0]?.value ?? "");
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
    const n = Number.parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    if (c.currency !== "USD" && c.rateLoading) return;
    const usd = c.displayAmountAsUsd(n);
    if (!Number.isFinite(usd) || usd <= 0) return;

    let type: "income" | "expense";
    let cat: string | null;
    let gid: string | null;

    if (entryType === "goal") {
      const pick = goalId.trim() || goalOptions[0]?.value || "";
      if (!pick) return;
      gid = pick;
      if (goalFlow === "to_goal") {
        type = "expense";
        cat = null;
      } else {
        type = "income";
        cat = null;
      }
    } else {
      type = entryType;
      gid = null;
      cat = type === "expense" ? categoryId || state.categories[0]?.id || null : null;
      if (type === "expense" && !cat) return;
    }

    addTransaction({
      date: transactionDateIsoUtc(date),
      amount: usd,
      type,
      categoryId: cat,
      goalId: gid,
      note: note.trim(),
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
          Income, expenses, or goal transfers. {c.canonicalHint}
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
            amountApproxLabel={c.amountApproxLabel}
            currency={c.currency}
            rateLoading={c.rateLoading}
            jpy={c.currency === "JPY"}
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
  const { state, updateTransaction } = useNudgeBudget();
  const c = useCurrency();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [entryType, setEntryType] = useState<TransactionEntryType>("expense");
  const [goalFlow, setGoalFlow] = useState<GoalFlow>("to_goal");
  const [categoryId, setCategoryId] = useState("");
  const [goalId, setGoalId] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));

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

  useEffect(() => {
    if (!props.open || !tx) return;
    const fb = state.categories[0]?.id ?? "";
    setAmount(String(c.usdAsDisplayAmount(tx.amount)));
    setNote(tx.note);
    setDate(format(parseISO(tx.date), "yyyy-MM-dd"));

    if (tx.goalId) {
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
  }, [props.open, tx, state.categories, c.usdAsDisplayAmount]);

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
  }

  useEffect(() => {
    if (entryType !== "goal" || goalOptions.length === 0) return;
    if (!goalId || !goalOptions.some((g) => g.value === goalId)) {
      setGoalId(goalOptions[0]?.value ?? "");
    }
  }, [entryType, goalId, goalOptions]);

  function submit() {
    if (!tx) return;
    const n = Number.parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    if (c.currency !== "USD" && c.rateLoading) return;
    const usd = c.displayAmountAsUsd(n);
    if (!Number.isFinite(usd) || usd <= 0) return;

    let type: "income" | "expense";
    let cat: string | null;
    let gid: string | null;

    if (entryType === "goal") {
      const pick = goalId.trim() || goalOptions[0]?.value || "";
      if (!pick) return;
      gid = pick;
      if (goalFlow === "to_goal") {
        type = "expense";
        cat = null;
      } else {
        type = "income";
        cat = null;
      }
    } else {
      type = entryType;
      gid = null;
      cat = type === "expense" ? categoryId || state.categories[0]?.id || null : null;
      if (type === "expense" && !cat) return;
    }

    updateTransaction(tx.id, {
      date: transactionDateIsoUtc(date),
      amount: usd,
      type,
      categoryId: cat,
      goalId: gid,
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
          Update this entry. {c.canonicalHint}
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
            amountApproxLabel={c.amountApproxLabel}
            currency={c.currency}
            rateLoading={c.rateLoading}
            jpy={c.currency === "JPY"}
          />

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
