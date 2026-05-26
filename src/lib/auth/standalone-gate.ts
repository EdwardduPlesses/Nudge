import { whopsdk } from "@/lib/whop-sdk";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Standalone access gate — does this user have an active Whop purchase
 * granting access to Nudge?
 *
 * Whop's only reliable user-scoped access check is
 * `users.checkAccess(resourceId, { id })`, and the resourceId must be an
 * experience, product, or company — not the app id. So we remember the most
 * recent experience id the user accessed Nudge from via the iframe (stored as
 * `nudge_profiles.last_experience_id`) and use that here.
 *
 * Consequence: a user who has never opened Nudge from their Whop community
 * cannot sign in via standalone — the gate has nothing to check against. The
 * callback error page tells them to open Nudge from their community first.
 */
export async function userHasAnyNudgeMembership(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("nudge_profiles")
    .select("last_experience_id")
    .eq("whop_user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[Nudge] standalone gate: nudge_profiles lookup failed", error);
    return false;
  }
  const experienceId = data?.last_experience_id;
  if (!experienceId) {
    console.log("[Nudge] standalone gate: no last_experience_id for user", userId);
    return false;
  }

  try {
    const result = await whopsdk.users.checkAccess(experienceId, { id: userId });
    return result.has_access === true;
  } catch (err) {
    console.error("[Nudge] standalone gate: users.checkAccess failed", err);
    return false;
  }
}
