"use client";

import { useEffect, useState } from "react";
import { Button, Card, Heading, Progress, Text, TextField } from "frosted-ui";
import { useCurrency } from "@/context/currency-context";
import { useNudgeBudget } from "@/context/nudge-budget-context";
import { categorySpendThisMonth } from "@/lib/budget/selectors";

function CapInput(props: { categoryId: string; budgetLimitUsd: number }) {
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
        disabled={c.currency !== "USD" && c.rateLoading}
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

export function BudgetsTab() {
  const c = useCurrency();
  const fmt = c.formatFromUsd;
  const { state, renameCategory, addCategory } = useNudgeBudget();
  const now = new Date();
  const [newName, setNewName] = useState("");
  const [newCap, setNewCap] = useState("200");

  return (
    <div className="flex flex-col gap-7">
      <div className="min-w-0">
        <Heading size="6" className="tracking-tight">
          Budgets
        </Heading>
        <Text size="2" color="gray" className="mt-2 max-w-prose leading-relaxed">
          Monthly caps compared to spending in each category.
        </Text>
      </div>

      <div className="flex flex-col gap-4">
        {state.categories.map((cat) => {
          const spent = categorySpendThisMonth(cat.id, state.transactions, now);
          const pct = cat.budgetLimit > 0 ? Math.min(100, (spent / cat.budgetLimit) * 100) : 0;
          return (
            <Card key={cat.id} size="3" variant="surface" className="nudge-card-surface">
              <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-start md:gap-x-8">
                <div className="flex min-w-0 flex-col gap-3">
                  <Text size="2" weight="medium" className="text-foreground/80">
                    Category
                  </Text>
                  <TextField.Root className="nudge-field w-full" key={cat.id}>
                    <TextField.Input
                      autoComplete="off"
                      placeholder="Name"
                      defaultValue={cat.name}
                      onBlur={(e: React.FocusEvent<HTMLInputElement>) =>
                        renameCategory(cat.id, e.target.value)
                      }
                    />
                  </TextField.Root>
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: cat.color }}
                      aria-hidden
                    />
                    <Text size="2" color="gray" className="min-w-0 break-words tabular-nums">
                      Spent {fmt(spent)} of {fmt(cat.budgetLimit)}
                    </Text>
                  </div>
                  <Progress value={pct} color={pct > 100 ? "ruby" : "gold"} />
                </div>
                <div className="flex w-full flex-col gap-2 border-t border-gray-600/15 pt-4 md:border-t-0 md:pt-0">
                  <Text size="2" weight="medium" className="text-foreground/80">
                    Monthly cap {c.amountApproxLabel}
                  </Text>
                  <CapInput categoryId={cat.id} budgetLimitUsd={cat.budgetLimit} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card size="3" variant="classic" className="nudge-card-surface">
        <Heading size="4" className="mb-1 tracking-tight">
          Add category
        </Heading>
        <Text size="2" color="gray" className="mb-5 leading-relaxed">
          Create a bucket and set how much you want to spend per month.
        </Text>
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
                Name
              </Text>
              <TextField.Root className="nudge-field w-full">
                <TextField.Input
                  placeholder="Subscriptions"
                  autoComplete="off"
                  value={newName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
                />
              </TextField.Root>
            </div>
            <div>
              <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
                Monthly cap {c.amountApproxLabel}
              </Text>
              <TextField.Root className="nudge-field w-full">
                <TextField.Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={c.currency === "JPY" ? 1 : "any"}
                  autoComplete="off"
                  disabled={c.currency !== "USD" && c.rateLoading}
                  value={newCap}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewCap(e.target.value)}
                />
              </TextField.Root>
            </div>
          </div>
          <Button
            size="3"
            color="gold"
            className="w-full shadow-sm sm:w-auto sm:self-start"
            onClick={() => {
              const n = Number.parseFloat(newCap);
              const capUsd = Number.isFinite(n) ? c.displayAmountAsUsd(n) : 0;
              addCategory(newName, Math.max(0, capUsd));
              setNewName("");
              setNewCap("200");
            }}
          >
            Add category
          </Button>
        </div>
      </Card>
    </div>
  );
}
