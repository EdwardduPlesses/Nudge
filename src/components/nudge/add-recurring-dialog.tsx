"use client";

import { useState } from "react";
import { Button, Callout, Dialog, RadioGroup, Select, Text, TextField } from "frosted-ui";
import { useCurrency } from "@/context/currency-context";
import { nudgeBudgetFetchInit, useNudgeBudget } from "@/context/nudge-budget-context";
import type { RecurringTiming } from "@/lib/budget/recurring";

type RecurringType = "income" | "expense";
const NO_CATEGORY = "__none__";

export function AddRecurringDialog(props: { trigger: React.ReactNode; onAdded: () => void }) {
  const { state, whopUserToken } = useNudgeBudget();
  const c = useCurrency();

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<RecurringType>("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string>(NO_CATEGORY);
  const [note, setNote] = useState("");
  const [timing, setTiming] = useState<RecurringTiming>("start");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function reset() {
    setType("expense");
    setAmount("");
    setCategoryId(NO_CATEGORY);
    setNote("");
    setTiming("start");
    setFormError(null);
  }

  async function submit() {
    setFormError(null);
    const amt = c.parseAmount(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setFormError("Enter an amount greater than zero.");
      return;
    }
    const body: {
      type: RecurringType;
      amount: number;
      timing: RecurringTiming;
      categoryId?: string;
      note?: string;
    } = { type, amount: amt, timing };
    if (type === "expense" && categoryId !== NO_CATEGORY) body.categoryId = categoryId;
    if (note.trim()) body.note = note.trim();

    setSubmitting(true);
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
      const json = (await res.json().catch(() => ({}))) as { item?: unknown; error?: string };
      if (!res.ok || !json.item) {
        setFormError(json.error || "Could not add recurring item.");
        return;
      }
      reset();
      setOpen(false);
      props.onAdded();
    } catch {
      setFormError("Could not add recurring item.");
    } finally {
      setSubmitting(false);
    }
  }

  const showCategory = type === "expense";

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
        <Dialog.Title>Add recurring item</Dialog.Title>
        <Dialog.Description size="2" color="gray" className="leading-relaxed">
          Income or bills added automatically each period.
        </Dialog.Description>

        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="mt-6 flex flex-col gap-5">
            {formError ? (
              <Callout.Root color="red" size="1">
                <Callout.Text>{formError}</Callout.Text>
              </Callout.Root>
            ) : null}

            <div>
              <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
                Type
              </Text>
              <Select.Root value={type} onValueChange={(v) => setType(v as RecurringType)}>
                <Select.Trigger placeholder="Choose type" aria-label="Recurring item type" className="min-h-11 w-full" />
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
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)}
                />
              </TextField.Root>
            </div>

            {showCategory && state.categories.length > 0 ? (
              <div>
                <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
                  Category <span className="font-normal text-gray-500">(optional)</span>
                </Text>
                <Select.Root value={categoryId} onValueChange={setCategoryId}>
                  <Select.Trigger placeholder="No category" aria-label="Recurring item category" className="min-h-11 w-full" />
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
                When
              </Text>
              <RadioGroup.Root value={timing} onValueChange={(v) => setTiming(v as RecurringTiming)}>
                <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                  <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-2.5 rounded-xl border border-gray-600/15 bg-gray-900/3 px-3 py-2.5 dark:bg-white/4">
                    <RadioGroup.Item value="start" />
                    <Text size="2">Start of period</Text>
                  </label>
                  <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-2.5 rounded-xl border border-gray-600/15 bg-gray-900/3 px-3 py-2.5 dark:bg-white/4">
                    <RadioGroup.Item value="end" />
                    <Text size="2">End of period</Text>
                  </label>
                </div>
              </RadioGroup.Root>
            </div>

            <div>
              <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
                Note <span className="font-normal text-gray-500">(optional)</span>
              </Text>
              <TextField.Root className="nudge-field w-full">
                <TextField.Input
                  placeholder="e.g. rent, salary"
                  autoComplete="off"
                  value={note}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNote(e.target.value)}
                />
              </TextField.Root>
            </div>
          </div>

          <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close>
              <Button type="button" variant="soft" color="gray" size="3" className="w-full sm:w-auto">
                Cancel
              </Button>
            </Dialog.Close>
            <Button type="submit" size="3" color="gold" disabled={submitting} className="w-full shadow-sm sm:w-auto">
              {submitting ? "Adding…" : "Add recurring item"}
            </Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}
