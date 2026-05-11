"use client";

import { Button } from "frosted-ui";
import { QuickAddExpenseDialog } from "@/components/nudge/quick-add-expense-dialog";

export function QuickAddExpenseButton(props: {
  variant?: "inline" | "fab";
  className?: string;
}) {
  const variant = props.variant ?? "inline";

  const trigger =
    variant === "fab" ? (
      <button type="button" className="atelier-fab" aria-label="Quick add expense">
        <svg
          aria-hidden
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    ) : (
      <Button
        type="button"
        size="3"
        variant="soft"
        color="gold"
        className={props.className ?? "w-full shadow-sm sm:w-auto"}
        aria-label="Quick add expense"
      >
        + Quick Add
      </Button>
    );

  return <QuickAddExpenseDialog trigger={trigger} />;
}
