"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Button, Card, Heading, Text } from "frosted-ui";
import { AddTransactionDialog } from "@/components/nudge/add-transaction-dialog";
import { useNudgeBudget } from "@/context/nudge-budget-context";

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);

export function ActivityTab() {
  const { state, removeTransaction } = useNudgeBudget();
  const sorted = useMemo(
    () =>
      [...state.transactions].sort(
        (a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime(),
      ),
    [state.transactions],
  );

  const cat = useMemo(() => new Map(state.categories.map((c) => [c.id, c])), [state.categories]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading size="6">Activity</Heading>
          <Text size="2" color="gray" className="mt-1">
            Newest first. Remove a row with one tap.
          </Text>
        </div>
        <AddTransactionDialog trigger={<Button>Add transaction</Button>} />
      </div>

      {sorted.length === 0 ? (
        <Card size="3" variant="surface" className="border border-dashed border-gray-600/35">
          <Text color="gray">No transactions yet. Add one from the button above.</Text>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((t) => {
            const label = t.type === "income" ? "Income" : cat.get(t.categoryId ?? "")?.name ?? "Uncategorized";
            return (
              <Card key={t.id} size="2" variant="classic" className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Text weight="bold">{money(t.amount)}</Text>
                    <Text
                      size="1"
                      className="rounded-full px-2 py-0.5"
                      style={{
                        background:
                          t.type === "income"
                            ? "rgba(16,185,129,0.15)"
                            : "rgba(148,163,184,0.2)",
                      }}
                    >
                      {t.type}
                    </Text>
                  </div>
                  <Text size="2" color="gray" className="mt-1">
                    {label}
                    {t.note ? ` · ${t.note}` : ""}
                  </Text>
                  <Text size="1" color="gray" className="mt-1">
                    {format(parseISO(t.date), "MMM d, yyyy")}
                  </Text>
                </div>
                <Button size="1" variant="ghost" color="red" onClick={() => removeTransaction(t.id)}>
                  Remove
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
