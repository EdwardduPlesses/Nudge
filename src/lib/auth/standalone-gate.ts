import { whopsdk } from "@/lib/whop-sdk";

/**
 * Standalone access gate — is this user allowed to use Nudge outside the Whop iframe?
 *
 * History:
 *   - Original plan called `experiences.list({ user_id })` — the SDK doesn't
 *     accept that filter.
 *   - First attempt: `memberships.list({ user_ids })` + `authorizedUsers.list({ user_id })`.
 *     Both return 400 "You are not authorized - ensure that you have access to
 *     this resource" because Whop requires a `company_id` filter on those
 *     endpoints; we don't know the company at OAuth-callback time.
 *
 * Current approach: ask Whop directly whether the user has access to *this app*
 * via `users.checkAccess(NEXT_PUBLIC_WHOP_APP_ID, { id: userId })`. On any API
 * error (e.g. if Whop doesn't accept the app id as a resource for that endpoint)
 * we fall back to allowing — OAuth completion already requires a valid Whop
 * account that authorized this app, which is a real (if soft) gate.
 *
 * Tighten by replacing the fallback with `return false` once we confirm a
 * reliable Whop call for "does this user have access to anything in this app".
 */
export async function userHasAnyNudgeMembership(userId: string): Promise<boolean> {
  const appId = process.env.NEXT_PUBLIC_WHOP_APP_ID;
  if (!appId) {
    console.warn("[Nudge] standalone gate: NEXT_PUBLIC_WHOP_APP_ID not set; allowing OAuth-verified user");
    return true;
  }

  try {
    const result = await whopsdk.users.checkAccess(appId, { id: userId });
    return result.has_access === true;
  } catch (err) {
    console.warn(
      "[Nudge] standalone gate: users.checkAccess(appId) failed; allowing OAuth-verified user",
      err,
    );
    return true;
  }
}
