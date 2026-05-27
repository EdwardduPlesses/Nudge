"use client";

import { useNudgeBudget } from "@/context/nudge-budget-context";
import { memberLabel } from "@/lib/budget/selectors";

/**
 * Small attribution chip: a member's color dot + label, with " (you)" appended
 * for the current user. Renders nothing in solo workbooks (one member) since
 * attribution is just noise there.
 */
export function MemberBadge({ userId }: { userId: string | null }) {
  const { state, currentUserId } = useNudgeBudget();

  if (state.members.length < 2) return null;

  const member = userId ? state.members.find((m) => m.whopUserId === userId) : undefined;
  const dotColor = member?.color ?? "var(--ink-faint)";
  const label = memberLabel(state.members, userId);
  const isYou = userId != null && userId === currentUserId;

  return (
    <span className="atelier-chip" style={{ textTransform: "none", letterSpacing: "0.02em" }}>
      <span
        aria-hidden
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      {label}
      {isYou ? " (you)" : ""}
    </span>
  );
}
