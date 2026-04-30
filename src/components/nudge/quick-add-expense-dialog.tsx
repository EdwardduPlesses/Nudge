"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Button, Dialog, Select, Text, TextField } from "frosted-ui";
import { useCurrency } from "@/context/currency-context";
import { useNudgeBudget } from "@/context/nudge-budget-context";

function transactionDateIsoUtc(dateStr: string): string {
  const t = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t}T12:00:00.000Z`;
  return `${format(new Date(), "yyyy-MM-dd")}T12:00:00.000Z`;
}

export function QuickAddExpenseDialog(props: { trigger: React.ReactNode }) {
  const { state, addTransaction } = useNudgeBudget();
  const c = useCurrency();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [categoryId, setCategoryId] = useState<string>(state.categories[0]?.id ?? "");
  const [amountError, setAmountError] = useState<string | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);

  const categoryOptions = useMemo(
    () =>
      state.categories.map((cat) => ({
        value: cat.id,
        label: cat.name,
      })),
    [state.categories],
  );

  const resolvedCategoryId = useMemo(() => {
    const first = state.categories[0]?.id ?? "";
    if (!categoryId || !state.categories.some((x) => x.id === categoryId)) return first;
    return categoryId;
  }, [categoryId, state.categories]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      amountInputRef.current?.focus();
      amountInputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  function reset() {
    setAmount("");
    setNote("");
    setCategoryId(state.categories[0]?.id ?? "");
    setAmountError(null);
  }

  function submit() {
    const trimmed = amount.trim();
    if (!trimmed) {
      setAmountError("Enter an amount");
      return;
    }
    const n = Number.parseFloat(trimmed);
    if (!Number.isFinite(n) || n <= 0) {
      setAmountError("Enter a valid amount");
      return;
    }
    if (c.currency !== "USD" && c.rateLoading) return;
    const usd = c.displayAmountAsUsd(n);
    if (!Number.isFinite(usd) || usd <= 0) {
      setAmountError("Enter a valid amount");
      return;
    }

    const cat = resolvedCategoryId || null;
    if (!cat) {
      setAmountError("Add a category in Budgets first");
      return;
    }

    addTransaction({
      date: transactionDateIsoUtc(format(new Date(), "yyyy-MM-dd")),
      amount: usd,
      type: "expense",
      categoryId: cat,
      goalId: null,
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
        if (!o) {
          reset();
          return;
        }
        setAmountError(null);
        setCategoryId((prev) => {
          const first = state.categories[0]?.id ?? "";
          if (!prev || !state.categories.some((x) => x.id === prev)) return first;
          return prev;
        });
      }}
    >
      <Dialog.Trigger>{props.trigger}</Dialog.Trigger>
      <Dialog.Content
        size="3"
        className="max-h-[calc(100dvh-2rem)] max-w-[min(calc(100vw-1.5rem),24rem)] overflow-y-auto overscroll-contain sm:max-w-md"
      >
        <Dialog.Title>Quick add expense</Dialog.Title>
        <Dialog.Description size="2" color="gray" className="leading-relaxed">
          Logged for today. {c.canonicalHint}
        </Dialog.Description>

        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="mt-6 flex flex-col gap-5">
            <div>
              <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
                Amount {c.amountApproxLabel}
              </Text>
              <TextField.Root className="nudge-field w-full">
                <TextField.Input
                  ref={amountInputRef}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={c.currency === "JPY" ? "1" : "any"}
                  enterKeyHint="done"
                  autoComplete="off"
                  placeholder={c.currency === "JPY" ? "0" : "0.00"}
                  value={amount}
                  disabled={c.currency !== "USD" && c.rateLoading}
                  aria-invalid={amountError != null}
                  aria-describedby={amountError ? "quick-add-amount-error" : undefined}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setAmount(e.target.value);
                    if (amountError) setAmountError(null);
                  }}
                />
              </TextField.Root>
              {amountError ? (
                <Text id="quick-add-amount-error" size="2" color="red" className="mt-2 block">
                  {amountError}
                </Text>
              ) : null}
            </div>

            {categoryOptions.length > 0 ? (
              <div>
                <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
                  Category
                </Text>
                <Select.Root value={resolvedCategoryId} onValueChange={setCategoryId}>
                  <Select.Trigger placeholder="Choose category" className="min-h-11 w-full" />
                  <Select.Content>
                    {categoryOptions.map((opt) => (
                      <Select.Item key={opt.value} value={opt.value}>
                        {opt.label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </div>
            ) : (
              <Text size="2" color="gray">
                Add categories under the Budgets tab to log expenses.
              </Text>
            )}

            <div>
              <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
                Note <span className="font-normal text-gray-500">(optional)</span>
              </Text>
              <TextField.Root className="nudge-field w-full">
                <TextField.Input
                  placeholder="e.g. coffee"
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
            <Button
              type="submit"
              size="3"
              color="gold"
              className="w-full shadow-sm sm:w-auto"
              disabled={categoryOptions.length === 0 || (c.currency !== "USD" && c.rateLoading)}
            >
              Save expense
            </Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}
