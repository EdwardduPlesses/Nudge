"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Button,
  Dialog,
  RadioGroup,
  Select,
  Text,
  TextField,
} from "frosted-ui";
import { useNudgeBudget } from "@/context/nudge-budget-context";

export function AddTransactionDialog(props: { trigger: React.ReactNode }) {
  const { state, addTransaction } = useNudgeBudget();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [type, setType] = useState<"expense" | "income">("expense");
  const [categoryId, setCategoryId] = useState<string>(state.categories[0]?.id ?? "");

  const categoryOptions = useMemo(
    () =>
      state.categories.map((c) => ({
        value: c.id,
        label: c.name,
      })),
    [state.categories],
  );

  function reset() {
    setAmount("");
    setNote("");
    setType("expense");
    setCategoryId(state.categories[0]?.id ?? "");
  }

  function submit() {
    const n = Number.parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    const today = format(new Date(), "yyyy-MM-dd");
    addTransaction({
      date: today,
      amount: n,
      type,
      categoryId: type === "expense" ? categoryId || null : null,
      note: note.trim(),
    });
    reset();
    setOpen(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>{props.trigger}</Dialog.Trigger>
      <Dialog.Content size="3" style={{ maxWidth: 420 }}>
        <Dialog.Title>Add transaction</Dialog.Title>
        <Dialog.Description size="2" color="gray">
          Log income or spending. Saved locally on this device.
        </Dialog.Description>
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <Text size="2" weight="medium" className="mb-2 block">
              Type
            </Text>
            <RadioGroup.Root value={type} onValueChange={(v) => setType(v as "expense" | "income")}>
              <div className="flex gap-4">
                <label className="flex cursor-pointer items-center gap-2">
                  <RadioGroup.Item value="expense" />
                  <Text size="2">Expense</Text>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <RadioGroup.Item value="income" />
                  <Text size="2">Income</Text>
                </label>
              </div>
            </RadioGroup.Root>
          </div>
          <div>
            <Text size="2" weight="medium" className="mb-2 block">
              Amount (USD)
            </Text>
            <TextField.Root>
              <TextField.Input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)}
              />
            </TextField.Root>
          </div>
          {type === "expense" && categoryOptions.length > 0 ? (
            <div>
              <Text size="2" weight="medium" className="mb-2 block">
                Category
              </Text>
              <Select.Root value={categoryId} onValueChange={setCategoryId}>
                <Select.Trigger placeholder="Choose category" />
                <Select.Content>
                  {categoryOptions.map((opt) => (
                    <Select.Item key={opt.value} value={opt.value}>
                      {opt.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </div>
          ) : null}
          <div>
            <Text size="2" weight="medium" className="mb-2 block">
              Note
            </Text>
            <TextField.Root>
              <TextField.Input
                placeholder="Coffee, rent, side gig…"
                value={note}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNote(e.target.value)}
              />
            </TextField.Root>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </Dialog.Close>
          <Button onClick={submit}>Save</Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
