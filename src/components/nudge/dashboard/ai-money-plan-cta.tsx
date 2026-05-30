"use client";

import { useEffect, useMemo, useState } from "react";
import { AiMoneyPlanModal } from "@/components/nudge/ai/ai-money-plan-modal";
import { useCurrency } from "@/context/currency-context";
import { nudgeBudgetFetchInit, useNudgeBudget } from "@/context/nudge-budget-context";
import { generateMoneyPlanPrompt } from "@/lib/ai/generate-money-plan-prompt";
import type { DebtInput } from "@/lib/budget/debt";

export function AiMoneyPlanCta() {
  const { state, whopUserToken } = useNudgeBudget();
  const { formatAmount, currencyCode } = useCurrency();
  const [open, setOpen] = useState(false);
  const [debts, setDebts] = useState<DebtInput[]>([]);

  // Debts live outside budget state — fetch them when the modal opens so the plan can
  // include balances, payoff order and a debt-free projection.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          "/api/debts",
          nudgeBudgetFetchInit(whopUserToken, { credentials: "include" }),
        );
        if (!res.ok) return;
        const data = (await res.json()) as { debts?: DebtInput[] };
        if (!cancelled) setDebts(data.debts ?? []);
      } catch {
        /* leave empty — the plan still generates, just without a debt section */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, whopUserToken]);

  const prompt = useMemo(
    () => generateMoneyPlanPrompt(state, formatAmount, { debts, currencyCode }),
    [state, formatAmount, debts, currencyCode],
  );

  return (
    <>
      <button
        type="button"
        className="atelier-btn-ghost w-full sm:w-auto"
        aria-label="Build AI money plan prompt"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden style={{ color: "var(--gold)" }}>
          ✦
        </span>
        Build AI Money Plan
      </button>
      <AiMoneyPlanModal open={open} onOpenChange={setOpen} prompt={prompt} />
    </>
  );
}
