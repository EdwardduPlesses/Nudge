"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Button, Card, Heading, Progress, Text, TextField } from "frosted-ui";
import { useNudgeBudget } from "@/context/nudge-budget-context";

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);

export function GoalsTab() {
  const { state, addGoal, updateGoalSaved, removeGoal } = useNudgeBudget();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("1000");
  const [saved, setSaved] = useState("0");
  const [deadline, setDeadline] = useState("");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Heading size="6">Savings goals</Heading>
        <Text size="2" color="gray" className="mt-1">
          Manual progress tracking—nudge yourself toward a target without linking bank accounts.
        </Text>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {state.goals.map((g) => {
          const pct = g.targetAmount > 0 ? Math.min(100, (g.savedAmount / g.targetAmount) * 100) : 0;
          return (
            <Card key={g.id} size="3" variant="surface">
              <div className="flex items-start justify-between gap-2">
                <Heading size="4">{g.name}</Heading>
                <Button size="1" variant="ghost" color="red" onClick={() => removeGoal(g.id)}>
                  Remove
                </Button>
              </div>
              {g.deadline ? (
                <Text size="2" color="gray" className="mt-1">
                  Target {format(parseISO(g.deadline), "MMM d, yyyy")}
                </Text>
              ) : null}
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <Text color="gray">Saved</Text>
                  <Text weight="medium">
                    {money(g.savedAmount)} / {money(g.targetAmount)}
                  </Text>
                </div>
                <Progress value={pct} color="cyan" />
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Text size="2" color="gray">
                  Update saved
                </Text>
                <TextField.Root style={{ width: 120 }}>
                  <TextField.Input
                    type="number"
                    value={String(g.savedAmount)}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      updateGoalSaved(g.id, Number.parseFloat(e.target.value) || 0)
                    }
                  />
                </TextField.Root>
              </div>
            </Card>
          );
        })}
      </div>

      <Card size="3" variant="classic">
        <Heading size="4" className="mb-3">
          New goal
        </Heading>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Text size="2" weight="medium" className="mb-1 block">
              Name
            </Text>
            <TextField.Root>
              <TextField.Input
                placeholder="Vacation fund"
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              />
            </TextField.Root>
          </div>
          <div>
            <Text size="2" weight="medium" className="mb-1 block">
              Target (USD)
            </Text>
            <TextField.Root>
              <TextField.Input
                type="number"
                value={target}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTarget(e.target.value)}
              />
            </TextField.Root>
          </div>
          <div>
            <Text size="2" weight="medium" className="mb-1 block">
              Already saved
            </Text>
            <TextField.Root>
              <TextField.Input
                type="number"
                value={saved}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSaved(e.target.value)}
              />
            </TextField.Root>
          </div>
          <div className="sm:col-span-2">
            <Text size="2" weight="medium" className="mb-1 block">
              Deadline (optional)
            </Text>
            <TextField.Root>
              <TextField.Input
                type="date"
                value={deadline}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeadline(e.target.value)}
              />
            </TextField.Root>
          </div>
        </div>
        <Button
          className="mt-4"
          onClick={() => {
            addGoal({
              name: name.trim() || "New goal",
              targetAmount: Number.parseFloat(target) || 0,
              savedAmount: Number.parseFloat(saved) || 0,
              deadline: deadline ? `${deadline}T12:00:00.000Z` : null,
            });
            setName("");
            setTarget("1000");
            setSaved("0");
            setDeadline("");
          }}
        >
          Create goal
        </Button>
      </Card>
    </div>
  );
}
