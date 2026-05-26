import { whopsdk } from "@/lib/whop-sdk";

/**
 * Standalone access gate — does the user have any active Whop membership that
 * this app (Nudge) can see?
 *
 * We call `whopsdk.memberships.list` with the app's `WHOP_API_KEY`. Whop scopes
 * app API keys to memberships in products that include the calling app, so the
 * result should already be Nudge-relevant. If smoke-testing reveals unrelated
 * memberships passing the gate, tighten this by either filtering on
 * `product_ids` (if we maintain a list of Nudge products) or by calling
 * `experiences.list({ company_id })` per company the user is a member of.
 *
 * DEVIATION FROM SPEC: the plan specified `experiences.list({ user_id })`, but
 * `ExperienceListParams` in @whop/sdk has no `user_id` filter — it requires
 * `company_id`. `memberships.list` is the closest equivalent that's user-scoped.
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
