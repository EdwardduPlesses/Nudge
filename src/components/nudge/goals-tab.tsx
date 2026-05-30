"use client";

import { format, parseISO } from "date-fns";
import { useEffect, useState } from "react";
import { Button, Dialog, Progress, TextField } from "frosted-ui";
import { NudgeDatePicker } from "@/components/nudge/nudge-date-picker";
import { ConfirmButton } from "@/components/nudge/confirm-button";
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
  jpy: boolean;
}) {
  return (
    <div className="mt-6 flex flex-col gap-5">
      <div>
        <span className="eyebrow mb-2 block">Name</span>
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
        <span className="eyebrow mb-2 block">Target</span>
        <TextField.Root className="nudge-field w-full">
          <TextField.Input
            type="number"
            inputMode="decimal"
            min={0}
            step={props.jpy ? 1 : "any"}
            autoComplete="off"
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
  const fmt = c.formatAmount;
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
    setEditTarget(String(editing.targetAmount));
    setEditDeadline(
      editing.deadline
        ? format(parseISO(editing.deadline), "yyyy-MM-dd")
        : "",
    );
  }, [editOpen, editing]);

  function submitCreate() {
    const t = c.parseAmount(target);
    addGoal({
      name: name.trim() || "New goal",
      targetAmount: Math.max(0, Number.isFinite(t) ? t : 0),
      savedAmount: 0,
      deadline: deadline ? `${deadline}T12:00:00.000Z` : null,
    });
    resetCreateForm();
    setCreateOpen(false);
  }

  function submitEdit() {
    if (!editing) return;
    const t = c.parseAmount(editTarget);
    updateGoal(editing.id, {
      name: editName.trim() || editing.name,
      targetAmount: Math.max(0, Number.isFinite(t) ? t : 0),
      deadline: editDeadline ? `${editDeadline}T12:00:00.000Z` : null,
    });
    setEditOpen(false);
    setEditing(null);
  }

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
            Reserves
          </span>
          <h2
            className="heading-display mt-3"
            style={{ color: "var(--ink)", fontSize: "clamp(1.6rem, 3.6vw, 2.15rem)", lineHeight: 1.1 }}
          >
            Savings goals
          </h2>
          <p className="mt-2 max-w-xl" style={{ color: "var(--ink-muted)", fontSize: "0.95rem", lineHeight: 1.55 }}>
            Progress updates when you log activity: use{" "}
            <strong style={{ color: "var(--ink)" }}>Add transaction</strong>, choose{" "}
            <strong style={{ color: "var(--ink)" }}>Goal</strong>, then{" "}
            <strong style={{ color: "var(--ink)" }}>Add to goal</strong> or{" "}
            <strong style={{ color: "var(--ink)" }}>Withdraw from goal</strong>.
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
                New goal
              </button>
            </Dialog.Trigger>
          ) : null}
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
              jpy={c.currencyCode === "JPY"}
            />

            <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Dialog.Close>
                <Button variant="soft" color="gray" size="3" className="w-full sm:w-auto">
                  Cancel
                </Button>
              </Dialog.Close>
              <button type="button" className="atelier-btn-gold w-full sm:w-auto" onClick={submitCreate}>
                <span aria-hidden style={{ fontSize: "1rem", lineHeight: 1 }}>
                  ✦
                </span>
                Create goal
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Root>
      </header>

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
              <div className="atelier-card mt-5 px-4 py-3.5">
                <span className="eyebrow">Saved toward goal (from activity)</span>
                <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <span
                    className="heading-display tabular"
                    style={{
                      color: "var(--ink)",
                      fontSize: "1.35rem",
                      fontWeight: 500,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {fmt(goalDisplaySaved(editing, state.transactions))}
                  </span>
                  <span
                    className="shrink-0 tabular"
                    style={{ color: "var(--ink-muted)", fontSize: "0.95rem" }}
                  >
                    / {fmt(editing.targetAmount)}
                  </span>
                </div>
              </div>

              <GoalFormFields
                name={editName}
                setName={setEditName}
                target={editTarget}
                setTarget={setEditTarget}
                deadline={editDeadline}
                setDeadline={setEditDeadline}
                jpy={c.currencyCode === "JPY"}
              />

              <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Dialog.Close>
                  <Button variant="soft" color="gray" size="3" className="w-full sm:w-auto">
                    Cancel
                  </Button>
                </Dialog.Close>
                <button type="button" className="atelier-btn-gold w-full sm:w-auto" onClick={submitEdit}>
                  <span aria-hidden style={{ fontSize: "1rem", lineHeight: 1 }}>
                    ✦
                  </span>
                  Save changes
                </button>
              </div>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Root>

      {state.goals.length === 0 ? (
        <div
          className="atelier-card px-4 py-10 text-center sm:px-6"
          style={{ borderStyle: "dashed", borderColor: "var(--hairline-strong)" }}
        >
          <p style={{ color: "var(--ink-muted)", lineHeight: 1.6 }}>
            No goals yet. Tap <strong style={{ color: "var(--ink)" }}>New goal</strong> to create one.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {state.goals.map((g) => {
            const saved = goalDisplaySaved(g, state.transactions);
            const pct = g.targetAmount > 0 ? Math.min(100, (saved / g.targetAmount) * 100) : 0;
            return (
              <article key={g.id} className="atelier-card atelier-card-interactive p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <h4
                    className="heading-display min-w-0 flex-1 wrap-break-word sm:pr-2"
                    style={{
                      color: "var(--ink)",
                      fontSize: "1.2rem",
                      lineHeight: 1.2,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {g.name}
                  </h4>
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
                    <ConfirmButton
                      title="Remove goal?"
                      description="This deletes the goal and unlinks it from any transactions that fed it."
                      confirmLabel="Remove"
                      onConfirm={() => removeGoal(g.id)}
                      trigger={
                        <Button
                          size="2"
                          variant="ghost"
                          color="red"
                          className="min-h-10 flex-1 sm:flex-none"
                          aria-label={`Remove goal ${g.name}`}
                        >
                          Remove
                        </Button>
                      }
                    />
                  </div>
                </div>
                {g.deadline ? (
                  <p
                    className="mt-2 tabular"
                    style={{ color: "var(--ink-muted)", fontSize: "0.85rem" }}
                  >
                    <span aria-hidden style={{ color: "var(--gold)", marginRight: "0.4em" }}>
                      ✦
                    </span>
                    Target {format(parseISO(g.deadline), "MMM d, yyyy")}
                  </p>
                ) : null}
                <div className="mt-5 space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                    <span className="eyebrow">Saved</span>
                    <span
                      className="tabular"
                      style={{
                        color: "var(--ink)",
                        fontWeight: 500,
                        fontSize: "0.92rem",
                      }}
                    >
                      {fmt(saved)} / {fmt(g.targetAmount)}
                    </span>
                  </div>
                  <Progress value={pct} color="gold" />
                </div>
                <p
                  className="mt-4"
                  style={{ color: "var(--ink-faint)", fontSize: "0.78rem", lineHeight: 1.5 }}
                >
                  Log allocations or withdrawals in Activity to move this balance.
                </p>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
