"use client";

import { useMemo, useState } from "react";
import { AiMoneyPlanModal } from "@/components/nudge/ai/ai-money-plan-modal";
import { useCurrency } from "@/context/currency-context";
import { useNudgeBudget } from "@/context/nudge-budget-context";
import { generateMoneyPlanPrompt } from "@/lib/ai/generate-money-plan-prompt";

export function AiMoneyPlanCta() {
  const { state } = useNudgeBudget();
  const { formatFromUsd } = useCurrency();
  const [open, setOpen] = useState(false);

  const prompt = useMemo(
    () => generateMoneyPlanPrompt(state, formatFromUsd),
    [formatFromUsd, state],
  );

  return (
    <>
      <button
        type="button"
        className="atelier-btn-ghost w-full sm:w-auto"
        aria-label="Generate AI Money Plan"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden style={{ color: "var(--gold)" }}>
          ✦
        </span>
        Generate AI Money Plan
      </button>
      <AiMoneyPlanModal open={open} onOpenChange={setOpen} prompt={prompt} />
    </>
  );
}
