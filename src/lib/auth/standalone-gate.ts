import { whopsdk } from "@/lib/whop-sdk";

/**
 * Standalone access gate — checks whether a user holds at least one active
 * membership to a product that has Nudge installed.
 *
 * DEVIATION FROM SPEC: The plan specified `whopsdk.experiences.list({ user_id })`,
 * but `ExperienceListParams` in node_modules/@whop/sdk/resources/experiences.d.ts
 * requires `company_id` and has NO `user_id` filter. That SDK method cannot be
 * used to enumerate experiences for a given user.
 *
 * We instead use `whopsdk.memberships.list({ user_ids: [userId], statuses: ["active"], first: 1 })`,
 * which is typed in `MembershipListParams` and returns a `CursorPage` whose
 * `.data` array contains matching memberships. An active membership means the
 * user has purchased a Whop product that uses this app, which is the correct
 * proxy for "has Nudge access".
 */
export async function userHasAnyNudgeMembership(userId: string): Promise<boolean> {
  try {
    const page = await whopsdk.memberships.list({ user_ids: [userId], statuses: ["active"], first: 1 });
    return Array.isArray(page.data) && page.data.length > 0;
  } catch (err) {
    console.error("[Nudge] standalone gate check failed", err);
    return false;
  }
}
