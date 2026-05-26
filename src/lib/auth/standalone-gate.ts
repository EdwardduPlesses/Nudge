import { whopsdk } from "@/lib/whop-sdk";

/**
 * Standalone access gate — is this user allowed to use Nudge outside the Whop iframe?
 *
 * Passes if EITHER:
 *   (a) the user holds at least one active Whop membership visible to this app, OR
 *   (b) the user is an authorized team member (admin/owner) of a company that has
 *       Nudge installed.
 *
 * The iframe's `users.checkAccess(experienceId, userId)` covers both cases
 * implicitly; we have to OR them ourselves out here because there is no
 * "experienceId" to scope against.
 */
export async function userHasAnyNudgeMembership(userId: string): Promise<boolean> {
  const [membership, teamMember] = await Promise.all([
    hasActiveMembership(userId),
    isAuthorizedTeamMember(userId),
  ]);
  return membership || teamMember;
}

async function hasActiveMembership(userId: string): Promise<boolean> {
  try {
    const page = await whopsdk.memberships.list({
      user_ids: [userId],
      statuses: ["active"],
      first: 1,
    });
    return Array.isArray(page.data) && page.data.length > 0;
  } catch (err) {
    console.error("[Nudge] standalone gate: memberships.list failed", err);
    return false;
  }
}

async function isAuthorizedTeamMember(userId: string): Promise<boolean> {
  try {
    const page = await whopsdk.authorizedUsers.list({ user_id: userId, first: 1 });
    return Array.isArray(page.data) && page.data.length > 0;
  } catch (err) {
    console.error("[Nudge] standalone gate: authorizedUsers.list failed", err);
    return false;
  }
}
