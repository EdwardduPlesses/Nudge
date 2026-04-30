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
      <Button
        type="button"
        size="3"
        color="gold"
        className={
          props.className ??
          "fixed bottom-5 right-4 z-50 min-h-12 rounded-full px-5 shadow-lg shadow-black/20 sm:bottom-6 sm:right-6"
        }
        aria-label="Quick add expense"
      >
        + Quick Add
      </Button>
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
