"use client";

import { format, parseISO } from "date-fns";
import { useEffect, useState } from "react";
import { Button, Card, Dialog, Heading, Progress, Text, TextField } from "frosted-ui";
import { NudgeDatePicker } from "@/components/nudge/nudge-date-picker";
import { useCurrency } from "@/context/currency-context";
import { useNudgeBudget } from "@/context/nudge-budget-context";
import { goalDisplaySaved } from "@/lib/budget/selectors";
import type { Goal } from "@/lib/budget/types";

function GoalFormFields(props: {
  name: string;
  setName: (v: string) => void;
  target: string;
  setTarget: (v: string) => void;
  deadline: string;
  setDeadline: (v: string) => void;
  amountApproxLabel: string;
  currency: string;
  rateLoading: boolean;
  jpy: boolean;
}) {
  return (
    <div className="mt-6 flex flex-col gap-5">
      <div>
        <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
          Name
        </Text>
        <TextField.Root className="nudge-field w-full">
          <TextField.Input
            placeholder="Vacation fund"
            autoComplete="off"
            value={props.name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => props.setName(e.target.value)}
          />
        </TextField.Root>
      </div>
      <div>
        <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
          Target {props.amountApproxLabel}
        </Text>
        <TextField.Root className="nudge-field w-full">
          <TextField.Input
            type="number"
            inputMode="decimal"
            min={0}
            step={props.jpy ? 1 : "any"}
            autoComplete="off"
            disabled={props.currency !== "USD" && props.rateLoading}
            value={props.target}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => props.setTarget(e.target.value)}
          />
        </TextField.Root>
      </div>
      <NudgeDatePicker
        label="Target date"
        optionalSuffix="(optional)"
        ariaLabel="Goal target date"
        value={props.deadline}
        onChange={props.setDeadline}
        allowClear
      />
    </div>
  );
}

export function GoalsTab() {
  const c = useCurrency();
  const fmt = c.formatFromUsd;
  const { state, addGoal, updateGoal, removeGoal } = useNudgeBudget();

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);

  const [name, setName] = useState("");
  const [target, setTarget] = useState("1000");
  const [deadline, setDeadline] = useState("");

  const [editName, setEditName] = useState("");
  const [editTarget, setEditTarget] = useState("");
  const [editDeadline, setEditDeadline] = useState("");

  function resetCreateForm() {
    setName("");
    setTarget("1000");
    setDeadline("");
  }

  useEffect(() => {
    if (!editOpen || !editing) return;
    setEditName(editing.name);
    setEditTarget(String(c.usdAsDisplayAmount(editing.targetAmount)));
    setEditDeadline(
      editing.deadline
        ? format(parseISO(editing.deadline), "yyyy-MM-dd")
        : "",
    );
  }, [editOpen, editing, c.currency, c.usdAsDisplayAmount]);

  function submitCreate() {
    const t = Number.parseFloat(target);
    const targetUsd = Number.isFinite(t) ? c.displayAmountAsUsd(t) : 0;
    addGoal({
      name: name.trim() || "New goal",
      targetAmount: Math.max(0, targetUsd),
      savedAmount: 0,
      deadline: deadline ? `${deadline}T12:00:00.000Z` : null,
    });
    resetCreateForm();
    setCreateOpen(false);
  }

  function submitEdit() {
    if (!editing) return;
    const t = Number.parseFloat(editTarget);
    const targetUsd = Number.isFinite(t) ? c.displayAmountAsUsd(t) : 0;
    updateGoal(editing.id, {
      name: editName.trim() || editing.name,
      targetAmount: Math.max(0, targetUsd),
      deadline: editDeadline ? `${editDeadline}T12:00:00.000Z` : null,
    });
    setEditOpen(false);
    setEditing(null);
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Heading size="6" className="tracking-tight">
            Savings goals
          </Heading>
          <Text size="2" color="gray" className="mt-2 max-w-xl leading-relaxed">
            Progress updates when you log activity: use{" "}
            <strong className="text-foreground/90">Add transaction</strong>, choose{" "}
            <strong className="text-foreground/90">Goal</strong>, then{" "}
            <strong className="text-foreground/90">Add to goal</strong> or{" "}
            <strong className="text-foreground/90">Withdraw from goal</strong>.
          </Text>
        </div>
        <Dialog.Root
          open={createOpen}
          onOpenChange={(o) => {
            setCreateOpen(o);
            if (!o) resetCreateForm();
          }}
        >
          <Dialog.Trigger>
            <Button size="3" color="gold" className="w-full shrink-0 shadow-sm sm:w-auto">
              New goal
            </Button>
          </Dialog.Trigger>
          <Dialog.Content
            size="3"
            className="max-h-[calc(100dvh-2rem)] max-w-[min(calc(100vw-1.5rem),24rem)] overflow-y-auto overscroll-contain sm:max-w-md"
          >
            <Dialog.Title>Create goal</Dialog.Title>
            <Dialog.Description size="2" color="gray" className="leading-relaxed">
              Set a target date and amount. Saved balance is tracked only through transactions linked to this goal.
            </Dialog.Description>

            <GoalFormFields
              name={name}
              setName={setName}
              target={target}
              setTarget={setTarget}
              deadline={deadline}
              setDeadline={setDeadline}
              amountApproxLabel={c.amountApproxLabel}
              currency={c.currency}
              rateLoading={c.rateLoading}
              jpy={c.currency === "JPY"}
            />

            <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Dialog.Close>
                <Button variant="soft" color="gray" size="3" className="w-full sm:w-auto">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button size="3" color="gold" className="w-full shadow-sm sm:w-auto" onClick={submitCreate}>
                Create goal
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Root>
      </div>

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
          <Dialog.Title>Edit goal</Dialog.Title>
          <Dialog.Description size="2" color="gray" className="leading-relaxed">
            Update the name, target, or deadline. Saved balance cannot be edited here—adjust it via linked transactions in Activity.
          </Dialog.Description>

          {editing ? (
            <>
              <div className="mt-5 rounded-xl border border-gray-600/15 bg-gray-900/4 px-4 py-3.5 dark:bg-white/4">
                <Text size="2" color="gray">
                  Saved toward goal (from activity)
                </Text>
                <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <Text weight="bold" className="min-w-0 tabular-nums text-lg tracking-tight">
                    {fmt(goalDisplaySaved(editing, state.transactions))}
                  </Text>
                  <Text className="shrink-0 text-base font-medium tabular-nums text-gray-500">
                    / {fmt(editing.targetAmount)}
                  </Text>
                </div>
              </div>

              <GoalFormFields
                name={editName}
                setName={setEditName}
                target={editTarget}
                setTarget={setEditTarget}
                deadline={editDeadline}
                setDeadline={setEditDeadline}
                amountApproxLabel={c.amountApproxLabel}
                currency={c.currency}
                rateLoading={c.rateLoading}
                jpy={c.currency === "JPY"}
              />

              <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Dialog.Close>
                  <Button variant="soft" color="gray" size="3" className="w-full sm:w-auto">
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button size="3" color="gold" className="w-full shadow-sm sm:w-auto" onClick={submitEdit}>
                  Save changes
                </Button>
              </div>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Root>

      {state.goals.length === 0 ? (
        <Card
          size="3"
          variant="surface"
          className="nudge-card-surface border border-dashed border-gray-600/30 px-4 py-10 text-center sm:px-6"
        >
          <Text color="gray" className="leading-relaxed">
            No goals yet. Tap <strong className="text-foreground">New goal</strong> to create one.
          </Text>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {state.goals.map((g) => {
            const saved = goalDisplaySaved(g, state.transactions);
            const pct = g.targetAmount > 0 ? Math.min(100, (saved / g.targetAmount) * 100) : 0;
            return (
              <Card key={g.id} size="3" variant="surface" className="nudge-card-surface">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <Heading size="4" className="min-w-0 flex-1 tracking-tight wrap-break-word sm:pr-2">
                    {g.name}
                  </Heading>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                    <Button
                      size="2"
                      variant="soft"
                      color="gray"
                      className="min-h-10 flex-1 sm:flex-none"
                      onClick={() => {
                        setEditing(g);
                        setEditOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="2"
                      variant="ghost"
                      color="red"
                      className="min-h-10 flex-1 sm:flex-none"
                      onClick={() => removeGoal(g.id)}
                      aria-label={`Remove goal ${g.name}`}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
                {g.deadline ? (
                  <Text size="2" color="gray" className="mt-2">
                    Target {format(parseISO(g.deadline), "MMM d, yyyy")}
                  </Text>
                ) : null}
                <div className="mt-5 space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                    <Text color="gray" className="shrink-0">
                      Saved
                    </Text>
                    <Text weight="medium" className="min-w-0 text-right tabular-nums">
                      {fmt(saved)} / {fmt(g.targetAmount)}
                    </Text>
                  </div>
                  <Progress value={pct} color="gold" />
                </div>
                <Text size="1" color="gray" className="mt-4 leading-snug">
                  Log allocations or withdrawals in Activity to move this balance.
                </Text>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
