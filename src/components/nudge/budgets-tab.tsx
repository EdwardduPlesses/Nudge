"use client";

import { useState } from "react";
import { Button, Card, Heading, Progress, Text, TextField } from "frosted-ui";
import { useNudgeBudget } from "@/context/nudge-budget-context";
import { categorySpendThisMonth } from "@/lib/budget/selectors";

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);

export function BudgetsTab() {
  const { state, updateCategoryBudget, renameCategory, addCategory } = useNudgeBudget();
  const now = new Date();
  const [newName, setNewName] = useState("");
  const [newCap, setNewCap] = useState("200");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Heading size="6">Budgets</Heading>
        <Text size="2" color="gray" className="mt-1 max-w-prose">
          Caps are monthly. Progress compares this month&apos;s expenses in each category to its cap.
        </Text>
      </div>

      <div className="flex flex-col gap-4">
        {state.categories.map((c) => {
          const spent = categorySpendThisMonth(c.id, state.transactions, now);
          const pct = c.budgetLimit > 0 ? Math.min(100, (spent / c.budgetLimit) * 100) : 0;
          return (
            <Card key={c.id} size="3" variant="surface">
              <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                <div className="flex min-w-0 flex-col gap-2">
                  <TextField.Root key={c.id}>
                    <TextField.Input
                      defaultValue={c.name}
                      onBlur={(e: React.FocusEvent<HTMLInputElement>) =>
                        renameCategory(c.id, e.target.value)
                      }
                    />
                  </TextField.Root>
                  <div className="flex flex-wrap items-center gap-3">
                    <Text size="2" color="gray">
                      Spent {money(spent)} of {money(c.budgetLimit)}
                    </Text>
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                  </div>
                  <Progress value={pct} color={pct > 100 ? "ruby" : "iris"} />
                </div>
                <div className="flex items-center gap-2">
                  <Text size="2" color="gray">
                    Cap
                  </Text>
                  <TextField.Root style={{ width: 112 }}>
                    <TextField.Input
                      type="number"
                      value={String(c.budgetLimit)}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        updateCategoryBudget(c.id, Number.parseFloat(e.target.value) || 0)
                      }
                    />
                  </TextField.Root>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card size="3" variant="classic">
        <Heading size="4" className="mb-3">
          Add category
        </Heading>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Text size="2" weight="medium" className="mb-1 block">
              Name
            </Text>
            <TextField.Root>
              <TextField.Input
                placeholder="Subscriptions"
                value={newName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
              />
            </TextField.Root>
          </div>
          <div>
            <Text size="2" weight="medium" className="mb-1 block">
              Monthly cap
            </Text>
            <TextField.Root>
              <TextField.Input
                type="number"
                value={newCap}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewCap(e.target.value)}
              />
            </TextField.Root>
          </div>
          <Button
            onClick={() => {
              addCategory(newName, Number.parseFloat(newCap) || 0);
              setNewName("");
              setNewCap("200");
            }}
          >
            Add
          </Button>
        </div>
      </Card>
    </div>
  );
}
