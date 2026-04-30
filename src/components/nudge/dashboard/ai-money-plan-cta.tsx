"use client";

import { useMemo, useState } from "react";
import { Button } from "frosted-ui";
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
      <Button
        variant="soft"
        color="gray"
        size="3"
        type="button"
        className="w-full shrink-0 border-gray-600/35 shadow-sm backdrop-blur-sm sm:w-auto"
        aria-label="Generate AI Money Plan"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden>✦{" "}</span>
        Generate AI Money Plan
      </Button>
      <AiMoneyPlanModal open={open} onOpenChange={setOpen} prompt={prompt} />
    </>
  );
}
