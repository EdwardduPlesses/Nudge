"use client";

import { useEffect, useMemo, useState } from "react";
import { Progress, Select, TextField } from "frosted-ui";
import { useCurrency } from "@/context/currency-context";
import { useNudgeBudget } from "@/context/nudge-budget-context";
import {
  categorySpendThisMonth,
  memberLabel,
  sumExpenses,
  totalPlannedIncome,
  transactionsThisMonth,
} from "@/lib/budget/selectors";

function CapInput(props: { categoryId: string; budgetLimitUsd: number; disabled?: boolean }) {
  const c = useCurrency();
  const { updateCategoryBudget } = useNudgeBudget();
  const [local, setLocal] = useState("");

  useEffect(() => {
    setLocal(String(c.usdAsDisplayAmount(props.budgetLimitUsd)));
  }, [props.budgetLimitUsd, c.currency, c.usdAsDisplayAmount]);

  return (
    <TextField.Root className="nudge-field w-full md:w-36">
      <TextField.Input
        type="number"
        inputMode="decimal"
        min={0}
        step={c.currency === "JPY" ? 1 : "any"}
        autoComplete="off"
        disabled={props.disabled || (c.currency !== "USD" && c.rateLoading)}
        value={local}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocal(e.target.value)}
        onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
          const n = Number.parseFloat(e.target.value);
          if (!Number.isFinite(n) || n < 0) {
            setLocal(String(c.usdAsDisplayAmount(props.budgetLimitUsd)));
            return;
          }
          const usd = c.displayAmountAsUsd(n);
          updateCategoryBudget(props.categoryId, usd);
          setLocal(String(c.usdAsDisplayAmount(usd)));
        }}
      />
    </TextField.Root>
  );
}

function MyIncomeInput(props: { incomeUsd: number; disabled?: boolean }) {
  const c = useCurrency();
  const { setMemberIncome, currentUserId } = useNudgeBudget();
  const [local, setLocal] = useState("");

  // Sync the editable draft when the stored income or display currency changes;
  // this is a plain string mirror of props, not a cascading state derivation.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocal(String(c.usdAsDisplayAmount(props.incomeUsd)));
  }, [props.incomeUsd, c.currency, c.usdAsDisplayAmount]);

  return (
    <TextField.Root className="nudge-field w-full min-w-0 sm:max-w-44">
      <TextField.Input
        type="number"
        inputMode="decimal"
        min={0}
        step={c.currency === "JPY" ? 1 : "any"}
        autoComplete="off"
        disabled={props.disabled || (c.currency !== "USD" && c.rateLoading)}
        value={local}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocal(e.target.value)}
        onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
          const n = Number.parseFloat(e.target.value);
          if (!Number.isFinite(n) || n < 0) {
            setLocal(String(c.usdAsDisplayAmount(props.incomeUsd)));
            return;
          }
          const usd = c.displayAmountAsUsd(n);
          setMemberIncome(currentUserId, usd);
          setLocal(String(c.usdAsDisplayAmount(usd)));
        }}
      />
    </TextField.Root>
  );
}

export function BudgetsTab() {
  const c = useCurrency();
  const fmt = c.formatFromUsd;
  const {
    state,
    renameCategory,
    addCategory,
    setMemberIncome,
    currentUserId,
    periodAnchorDay,
    setPeriodAnchorDay,
  } = useNudgeBudget();
  const readOnly = !state.editable;
  const [newName, setNewName] = useState("");
  const [newCap, setNewCap] = useState("200");
  const [incomeDraft, setIncomeDraft] = useState("");

  const myIncome = useMemo(
    () => state.memberIncomes.find((i) => i.whopUserId === currentUserId)?.plannedAmount ?? 0,
    [state.memberIncomes, currentUserId],
  );

  const isShared = state.members.length >= 2;
  const incomeByUser = useMemo(
    () => new Map(state.memberIncomes.map((i) => [i.whopUserId, i.plannedAmount])),
    [state.memberIncomes],
  );
  const householdTotal = useMemo(() => totalPlannedIncome(state), [state]);

  useEffect(() => {
    // Plain string mirror of stored income for the solo single-input path; not a
    // cascading derivation, so scope-disable the set-state-in-effect rule here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIncomeDraft(String(c.usdAsDisplayAmount(myIncome)));
  }, [c.currency, myIncome, c.usdAsDisplayAmount]);

  const monthTx = useMemo(
    () => transactionsThisMonth(state.transactions, new Date()),
    [state.transactions],
  );
  const spent = useMemo(() => sumExpenses(monthTx), [monthTx]);
  const totalBudget = state.categories.reduce((s, cat) => s + cat.budgetLimit, 0);
  const budgetUsedRatio =
    totalBudget > 0 ? Math.min(1, spent / totalBudget) : spent > 0 ? 1 : 0;

  return (
    <div className="flex flex-col gap-8">
      {/* ───── Header ───── */}
      <header className="min-w-0">
        <span className="eyebrow">
          <span className="eyebrow-gold">N°01</span>
          <span aria-hidden style={{ margin: "0 0.5em", color: "var(--ink-faint)" }}>
            —
          </span>
          Plan
        </span>
        <h2
          className="heading-display mt-3"
          style={{ color: "var(--ink)", fontSize: "clamp(1.6rem, 3.6vw, 2.15rem)", lineHeight: 1.1 }}
        >
          Budgets
        </h2>
        <p className="mt-2 max-w-prose" style={{ color: "var(--ink-muted)", fontSize: "0.95rem", lineHeight: 1.55 }}>
          Income plan, usage across category limits, and monthly caps.
        </p>
      </header>

      {readOnly ? (
        <p
          className="italic"
          style={{
            color: "var(--ink-muted)",
            fontSize: "0.86rem",
            fontFamily: "var(--font-fraunces), serif",
          }}
        >
          Viewing a past period — editing is disabled.
        </p>
      ) : null}

      {/* ───── Income plan card ───── */}
      <section className="atelier-card-elevated" style={{ padding: "1.4rem 1.5rem" }}>
        <div className="min-w-0">
          <span className="eyebrow">Income plan</span>
          <h3
            className="heading-display mt-1.5"
            style={{ color: "var(--ink)", fontSize: "1.25rem", lineHeight: 1.2 }}
          >
            Monthly income
          </h3>
          <p className="mt-1" style={{ color: "var(--ink-muted)", fontSize: "0.86rem", lineHeight: 1.5 }}>
            Expected cash in for the month (feeds your Overview “left this month”).
          </p>
        </div>

        {isShared ? (
          <div className="mt-5 flex flex-col gap-3">
            {state.members.map((m) => {
              const isMe = m.whopUserId === currentUserId;
              const amountUsd = incomeByUser.get(m.whopUserId) ?? 0;
              return (
                <div
                  key={m.whopUserId}
                  className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: m.color ?? "var(--ink-faint)" }}
                      aria-hidden
                    />
                    <span
                      className="min-w-0 truncate"
                      style={{ color: "var(--ink)", fontSize: "0.92rem", fontWeight: 500 }}
                    >
                      {memberLabel(state.members, m.whopUserId)}
                      {isMe ? " (you)" : ""}
                    </span>
                  </div>
                  <div className="flex w-full items-center gap-3 sm:w-auto">
                    {isMe ? (
                      <MyIncomeInput incomeUsd={myIncome} disabled={readOnly} />
                    ) : (
                      <span
                        className="tabular"
                        style={{ color: "var(--ink-soft)", fontSize: "0.95rem" }}
                      >
                        {fmt(amountUsd)}
                      </span>
                    )}
                    <span
                      className="shrink-0 tabular"
                      style={{ color: "var(--ink-muted)", fontSize: "0.86rem" }}
                    >
                      / mo
                    </span>
                  </div>
                </div>
              );
            })}
            <div
              className="mt-1 flex items-baseline justify-between pt-3"
              style={{ borderTop: "1px solid var(--hairline)" }}
            >
              <span className="eyebrow">Household total</span>
              <span
                className="heading-display tabular"
                style={{ color: "var(--ink)", fontSize: "1.1rem", lineHeight: 1.2 }}
              >
                {fmt(householdTotal)} / mo
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
            <label className="sr-only" htmlFor="budgets-income-plan-input">
              Monthly income {c.amountApproxLabel}
            </label>
            <TextField.Root className="nudge-field w-full min-w-0 sm:max-w-44">
              <TextField.Input
                id="budgets-income-plan-input"
                type="number"
                inputMode="decimal"
                min={0}
                step={c.currency === "JPY" ? 1 : "any"}
                autoComplete="off"
                disabled={readOnly || (c.currency !== "USD" && c.rateLoading)}
                value={incomeDraft}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIncomeDraft(e.target.value)}
                onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                  const n = Number.parseFloat(e.target.value);
                  if (!Number.isFinite(n) || n < 0) {
                    setIncomeDraft(String(c.usdAsDisplayAmount(myIncome)));
                    return;
                  }
                  const usd = c.displayAmountAsUsd(n);
                  setMemberIncome(currentUserId, usd);
                  setIncomeDraft(String(c.usdAsDisplayAmount(usd)));
                }}
              />
            </TextField.Root>
            <span
              className="shrink-0 tabular"
              style={{ color: "var(--ink-muted)", fontSize: "0.86rem" }}
            >
              {c.currency === "USD" ? "USD" : c.currency} / mo
            </span>
          </div>
        )}

        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="eyebrow">Budget usage</span>
            <span
              className="tabular"
              style={{ color: "var(--ink-muted)", fontSize: "0.82rem" }}
            >
              {Math.round(budgetUsedRatio * 100)}% of category limits
            </span>
          </div>
          <Progress value={budgetUsedRatio * 100} color="gold" />
        </div>

        <div
          className="mt-6 flex flex-col gap-2 pt-5 sm:max-w-xs"
          style={{ borderTop: "1px solid var(--hairline)" }}
        >
          <span className="eyebrow">Budget cycle starts on</span>
          <Select.Root
            value={String(periodAnchorDay)}
            disabled={readOnly}
            onValueChange={(v) => {
              void setPeriodAnchorDay(Number(v));
            }}
          >
            <Select.Trigger
              placeholder="Start day"
              aria-label="Budget cycle start day"
              className="min-h-10 w-full"
            />
            <Select.Content>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                <Select.Item key={day} value={String(day)}>
                  {`Day ${day}`}
                </Select.Item>
              ))}
              <Select.Item value="31">Last day of month</Select.Item>
            </Select.Content>
          </Select.Root>
          <p style={{ color: "var(--ink-muted)", fontSize: "0.8rem", lineHeight: 1.5 }}>
            Defines when each monthly budget period begins.
          </p>
        </div>
      </section>

      <div className="atelier-rule" role="presentation">
        <span aria-hidden>✦</span>
      </div>

      {/* ───── Category list ───── */}
      <section aria-label="Categories" className="flex flex-col gap-3">
        <div className="flex items-end justify-between">
          <span className="eyebrow">
            <span className="eyebrow-gold">N°02</span>
            <span aria-hidden style={{ margin: "0 0.5em", color: "var(--ink-faint)" }}>
              —
            </span>
            Categories
          </span>
          <span className="eyebrow tabular" style={{ color: "var(--ink-faint)" }}>
            {String(state.categories.length).padStart(2, "0")} entries
          </span>
        </div>
        {state.categories.map((cat) => {
          const spent = categorySpendThisMonth(cat.id, state.transactions, new Date());
          const pct = cat.budgetLimit > 0 ? Math.min(100, (spent / cat.budgetLimit) * 100) : 0;
          return (
            <article key={cat.id} className="atelier-card" style={{ padding: "1.1rem 1.25rem" }}>
              <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-start md:gap-x-8">
                <div className="flex min-w-0 flex-col gap-3">
                  <span className="eyebrow">Category</span>
                  <TextField.Root className="nudge-field w-full" key={cat.id}>
                    <TextField.Input
                      autoComplete="off"
                      placeholder="Name"
                      defaultValue={cat.name}
                      disabled={readOnly}
                      onBlur={(e: React.FocusEvent<HTMLInputElement>) =>
                        renameCategory(cat.id, e.target.value)
                      }
                    />
                  </TextField.Root>
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: cat.color }}
                      aria-hidden
                    />
                    <span
                      className="min-w-0 break-words tabular"
                      style={{ color: "var(--ink-muted)", fontSize: "0.85rem" }}
                    >
                      Spent {fmt(spent)} of {fmt(cat.budgetLimit)}
                    </span>
                  </div>
                  <Progress value={pct} color={pct > 100 ? "ruby" : "gold"} />
                </div>
                <div
                  className="flex w-full flex-col gap-2 pt-3 md:pt-0"
                  style={{ borderTop: "1px solid var(--hairline)" }}
                >
                  <span className="eyebrow md:mt-0" style={{ paddingTop: "0.75rem" }}>
                    Monthly cap {c.amountApproxLabel}
                  </span>
                  <CapInput categoryId={cat.id} budgetLimitUsd={cat.budgetLimit} disabled={readOnly} />
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <div className="atelier-rule" role="presentation">
        <span aria-hidden>✦</span>
      </div>

      {/* ───── Add category ───── */}
      <section className="atelier-card-elevated" style={{ padding: "1.4rem 1.5rem" }}>
        <span className="eyebrow">
          <span className="eyebrow-gold">N°03</span>
          <span aria-hidden style={{ margin: "0 0.5em", color: "var(--ink-faint)" }}>
            —
          </span>
          New entry
        </span>
        <h3
          className="heading-display mt-1.5"
          style={{ color: "var(--ink)", fontSize: "1.25rem", lineHeight: 1.2 }}
        >
          Add category
        </h3>
        <p className="mt-1 mb-5" style={{ color: "var(--ink-muted)", fontSize: "0.86rem", lineHeight: 1.55 }}>
          Create a bucket and set how much you want to spend per month.
        </p>
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="eyebrow mb-2 block">Name</span>
              <TextField.Root className="nudge-field w-full">
                <TextField.Input
                  placeholder="Subscriptions"
                  autoComplete="off"
                  disabled={readOnly}
                  value={newName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
                />
              </TextField.Root>
            </div>
            <div>
              <span className="eyebrow mb-2 block">Monthly cap {c.amountApproxLabel}</span>
              <TextField.Root className="nudge-field w-full">
                <TextField.Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={c.currency === "JPY" ? 1 : "any"}
                  autoComplete="off"
                  disabled={readOnly || (c.currency !== "USD" && c.rateLoading)}
                  value={newCap}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewCap(e.target.value)}
                />
              </TextField.Root>
            </div>
          </div>
          <button
            type="button"
            disabled={readOnly}
            className="atelier-btn-gold w-full sm:w-auto sm:self-start disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              const n = Number.parseFloat(newCap);
              const capUsd = Number.isFinite(n) ? c.displayAmountAsUsd(n) : 0;
              addCategory(newName, Math.max(0, capUsd));
              setNewName("");
              setNewCap("200");
            }}
          >
            <span aria-hidden style={{ fontSize: "1rem", lineHeight: 1 }}>
              ✦
            </span>
            Add category
          </button>
        </div>
      </section>
    </div>
  );
}
