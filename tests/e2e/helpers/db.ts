import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadTestEnv } from "./env";

/**
 * The isolated E2E identity. In development the dev-preview auth fallback
 * (`src/lib/auth/current-user.ts`) resolves the caller to this id, so a local
 * `next dev` server is authenticated as this user with no Whop iframe / OAuth.
 * Its workbook is per-user and isolated from every real user's data.
 */
export const TEST_USER_ID = "dev_local_user";

function admin(): SupabaseClient {
  loadTestEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "E2E DB helper: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (check .env.local)",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Reset the test user to a blank slate. Deletes the user's workbook (every child
 * row cascades via `on delete cascade`), any stray memberships, and the profile.
 *
 * Hard safety guard: refuses to run for any id other than {@link TEST_USER_ID},
 * so a bug in a test can never delete a real user's data.
 */
export async function resetTestUser(userId: string = TEST_USER_ID): Promise<void> {
  if (userId !== TEST_USER_ID) {
    throw new Error(`resetTestUser refused: '${userId}' is not the known test user`);
  }
  const sb = admin();
  // Deleting workbooks owned by the test user cascades to categories, transactions,
  // goals, periods, period_incomes, period_category_limits, invites, recurring_items,
  // debts, activity, and membership rows (all FK `on delete cascade`).
  const wb = await sb.from("nudge_workbooks").delete().eq("whop_user_id", userId);
  if (wb.error) throw wb.error;
  const mem = await sb.from("nudge_workbook_members").delete().eq("whop_user_id", userId);
  if (mem.error) throw mem.error;
  const prof = await sb.from("nudge_profiles").delete().eq("whop_user_id", userId);
  if (prof.error) throw prof.error;
}

/** Read the test user's workbook id (null if none yet). */
export async function getTestWorkbookId(userId: string = TEST_USER_ID): Promise<string | null> {
  const sb = admin();
  const { data } = await sb
    .from("nudge_workbooks")
    .select("id")
    .eq("whop_user_id", userId)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

/** Set the workbook's anchor day directly (bypasses the UI) for arranging test state. */
export async function setAnchorDay(day: number, userId: string = TEST_USER_ID): Promise<void> {
  const sb = admin();
  const { error } = await sb
    .from("nudge_workbooks")
    .update({ period_anchor_day: day })
    .eq("whop_user_id", userId);
  if (error) throw error;
}

/** List the test user's period start dates, newest first. */
export async function listPeriodStarts(userId: string = TEST_USER_ID): Promise<string[]> {
  const sb = admin();
  const id = await getTestWorkbookId(userId);
  if (!id) return [];
  const { data } = await sb
    .from("nudge_periods")
    .select("start_date")
    .eq("workbook_id", id)
    .order("start_date", { ascending: false });
  return (data ?? []).map((r) => r.start_date as string);
}
