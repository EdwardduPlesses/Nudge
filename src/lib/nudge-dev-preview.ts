/** Stable Whop-shaped user id for local development when no real token is present. */
export const NUDGE_DEV_PREVIEW_USER_ID = "dev_local_user";

/** When set to "1", dev pages and APIs require real Whop verification (no preview user). */
export function devStrictWhop(): boolean {
  return process.env.NUDGE_STRICT_WHOP === "1";
}

function devPreviewUserAllowed(): boolean {
  return process.env.NODE_ENV === "development" && !devStrictWhop();
}

/**
 * Resolved user id for budget persistence (RSC + /api/budget-state).
 * In development (unless strict), missing Whop auth falls back to {@link NUDGE_DEV_PREVIEW_USER_ID}.
 */
export function resolveNudgeUserIdForBudgetApi(
  verifiedUserId: string | null | undefined,
): string | null {
  if (verifiedUserId) return verifiedUserId;
  if (devPreviewUserAllowed()) return NUDGE_DEV_PREVIEW_USER_ID;
  return null;
}
