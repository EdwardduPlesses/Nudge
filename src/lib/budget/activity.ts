import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { whopsdk } from "@/lib/whop-sdk";

const MEMBER_PALETTE = ["#6366f1", "#ec4899", "#22c55e", "#f59e0b", "#14b8a6", "#8b5cf6"];

export type ActivityAction = "created" | "updated" | "deleted";
export type ActivityEntity =
  | "transaction" | "category" | "goal" | "income" | "limit" | "member" | "workbook" | "recurring" | "debt";

/** Best-effort: never throws; a logging failure must not fail the primary write. */
export async function logActivity(
  workbookId: string,
  actorUserId: string,
  action: ActivityAction,
  entityType: ActivityEntity,
  entityId: string | null,
  summary: string,
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from("nudge_activity").insert({
      workbook_id: workbookId,
      actor_user_id: actorUserId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      summary,
    });
  } catch (err) {
    console.error("[Nudge] logActivity failed", err);
  }
}

export interface ActivityRow {
  id: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  createdAt: string;
}

export async function listActivity(
  workbookId: string,
  opts: { actorUserId?: string | null; limit?: number } = {},
): Promise<ActivityRow[]> {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from("nudge_activity")
    .select("id, actor_user_id, action, entity_type, entity_id, summary, created_at")
    .eq("workbook_id", workbookId)
    .order("created_at", { ascending: false })
    .limit(Math.min(opts.limit ?? 50, 200));
  if (opts.actorUserId) q = q.eq("actor_user_id", opts.actorUserId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    actorUserId: r.actor_user_id as string,
    action: r.action as string,
    entityType: r.entity_type as string,
    entityId: (r.entity_id as string) ?? null,
    summary: r.summary as string,
    createdAt: r.created_at as string,
  }));
}

export interface EnrichedMember {
  whopUserId: string;
  role: string;
  displayName: string | null;
  color: string;
}

/**
 * Fill missing display_name (via Whop username/name) and color (deterministic palette by
 * join order) for a workbook's members, persisting once. Best-effort on the Whop lookup.
 */
export async function ensureMemberProfiles(workbookId: string): Promise<EnrichedMember[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("nudge_workbook_members")
    .select("whop_user_id, role, display_name, color, joined_at")
    .eq("workbook_id", workbookId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  // Resolve any missing display names from Whop in PARALLEL (this sits on the primary
  // read path; a serial per-member loop made every state fetch wait on N round-trips).
  const resolvedNames = await Promise.all(
    rows.map(async (r) => {
      if (r.display_name) return null;
      try {
        const u = await whopsdk.users.retrieve(r.whop_user_id as string);
        return u.username ?? u.name ?? null;
      } catch {
        return null;
      }
    }),
  );

  const out: EnrichedMember[] = [];
  const updates: PromiseLike<unknown>[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    let displayName: string | null = (r.display_name as string) ?? null;
    let color: string | null = (r.color as string) ?? null;
    const patch: Record<string, unknown> = {};
    if (!displayName && resolvedNames[i]) {
      displayName = resolvedNames[i];
      patch.display_name = displayName;
    }
    if (!color) {
      color = MEMBER_PALETTE[i % MEMBER_PALETTE.length];
      patch.color = color;
    }
    if (Object.keys(patch).length > 0) {
      updates.push(
        supabase
          .from("nudge_workbook_members")
          .update(patch)
          .eq("workbook_id", workbookId)
          .eq("whop_user_id", r.whop_user_id as string),
      );
    }
    out.push({ whopUserId: r.whop_user_id as string, role: (r.role as string) ?? "member", displayName, color: color ?? MEMBER_PALETTE[i % MEMBER_PALETTE.length] });
  }
  if (updates.length > 0) await Promise.all(updates);
  return out;
}
