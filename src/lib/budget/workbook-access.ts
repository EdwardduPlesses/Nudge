import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface MembershipRef {
  workbookId: string;
  joinedAt: string;
}

/** Pure selection: most-recently-joined membership wins (one workbook for 2-person v1). */
export function pickActiveWorkbookId(memberships: MembershipRef[]): string | null {
  if (memberships.length === 0) return null;
  return [...memberships].sort((a, b) => (a.joinedAt < b.joinedAt ? 1 : -1))[0].workbookId;
}

/** List the workbooks a user belongs to (membership rows). */
export async function listMemberships(whopUserId: string): Promise<MembershipRef[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("nudge_workbook_members")
    .select("workbook_id, joined_at")
    .eq("whop_user_id", whopUserId);
  if (error) throw error;
  return (data ?? []).map((r) => ({ workbookId: r.workbook_id as string, joinedAt: r.joined_at as string }));
}

/** True if the user is a member of the workbook. Authorization gate for all mutations. */
export async function userIsWorkbookMember(whopUserId: string, workbookId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("nudge_workbook_members")
    .select("workbook_id")
    .eq("whop_user_id", whopUserId)
    .eq("workbook_id", workbookId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/**
 * Resolve the caller's active workbook id, creating a personal workbook + owner
 * membership + initial period on first use. Returns the workbook id.
 */
export async function ensureActiveWorkbook(whopUserId: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const existing = pickActiveWorkbookId(await listMemberships(whopUserId));
  if (existing) return existing;

  await supabase.from("nudge_profiles").upsert({ whop_user_id: whopUserId }, { onConflict: "whop_user_id" });
  const { data: wb, error: wbErr } = await supabase
    .from("nudge_workbooks")
    .insert({ whop_user_id: whopUserId, period_anchor_day: 1 })
    .select("id")
    .single();
  if (wbErr) throw wbErr;
  const workbookId = wb.id as string;
  const { error: memErr } = await supabase
    .from("nudge_workbook_members")
    .insert({ workbook_id: workbookId, whop_user_id: whopUserId, role: "owner" });
  if (memErr) throw memErr;
  return workbookId;
}
