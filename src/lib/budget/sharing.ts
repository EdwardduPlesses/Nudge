import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { whopsdk } from "@/lib/whop-sdk";
import { ensureCurrentPeriod } from "./period-repo";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I,O,0,1
export function generateInviteCode(): string {
  let out = "";
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return out;
}

export type AcceptMode = "adopt" | "fresh";
export function isValidAcceptMode(m: unknown): m is AcceptMode {
  return m === "adopt" || m === "fresh";
}

export function pickExactUsernameMatch(
  rows: { id: string; username: string }[],
  username: string,
): { id: string; username: string } | null {
  const target = username.trim().toLowerCase().replace(/^@/, "");
  return rows.find((r) => r.username.toLowerCase() === target) ?? null;
}

const MAX_MEMBERS = 2;

export async function workbookMemberCount(workbookId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from("nudge_workbook_members")
    .select("workbook_id", { count: "exact", head: true })
    .eq("workbook_id", workbookId);
  if (error) throw error;
  return count ?? 0;
}

/** Look up a Whop user by exact username. Returns null if not found / lookup fails. */
export async function lookupUserByUsername(username: string): Promise<{ id: string; username: string } | null> {
  try {
    const rows: { id: string; username: string }[] = [];
    const page = whopsdk.users.list({ query: username.trim().replace(/^@/, "") });
    for await (const u of page) {
      if (u.username) rows.push({ id: u.id, username: u.username });
      if (rows.length >= 25) break;
    }
    return pickExactUsernameMatch(rows, username);
  } catch (err) {
    console.error("[Nudge] username lookup failed", err);
    return null;
  }
}

export interface InviteRow {
  id: string;
  workbookId: string;
  inviterUserId: string;
  code: string | null;
  inviteeUsername: string | null;
  inviteeUserId: string | null;
  status: string;
}

function mapInvite(r: Record<string, unknown>): InviteRow {
  return {
    id: r.id as string,
    workbookId: r.workbook_id as string,
    inviterUserId: r.inviter_user_id as string,
    code: (r.code as string) ?? null,
    inviteeUsername: (r.invitee_username as string) ?? null,
    inviteeUserId: (r.invitee_user_id as string) ?? null,
    status: r.status as string,
  };
}

/** Create an invite for the inviter's workbook. Blocks if the workbook is full or already has a pending invite. */
export async function createInvite(
  workbookId: string,
  inviterUserId: string,
  method: "username" | "code",
  username?: string,
): Promise<{ ok: true; invite: InviteRow } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();
  if ((await workbookMemberCount(workbookId)) >= MAX_MEMBERS) {
    return { ok: false, error: "This budget already has two members." };
  }
  const { data: pending } = await supabase
    .from("nudge_invites")
    .select("id")
    .eq("workbook_id", workbookId)
    .eq("status", "pending")
    .limit(1);
  if (pending && pending.length > 0) {
    return { ok: false, error: "There is already a pending invite. Revoke it first." };
  }

  let inviteeUsername: string | null = null;
  let inviteeUserId: string | null = null;
  if (method === "username") {
    if (!username?.trim()) return { ok: false, error: "Enter a username." };
    const found = await lookupUserByUsername(username);
    if (!found) return { ok: false, error: "No Whop user with that exact username. Try a share code instead." };
    if (found.id === inviterUserId) return { ok: false, error: "You can't invite yourself." };
    inviteeUsername = found.username;
    inviteeUserId = found.id;
  }
  const code = generateInviteCode();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  const { data, error } = await supabase
    .from("nudge_invites")
    .insert({
      workbook_id: workbookId,
      inviter_user_id: inviterUserId,
      code,
      invitee_username: inviteeUsername,
      invitee_user_id: inviteeUserId,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, invite: mapInvite(data) };
}

export async function listIncomingInvites(userId: string): Promise<InviteRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("nudge_invites")
    .select("*")
    .eq("invitee_user_id", userId)
    .eq("status", "pending");
  if (error) throw error;
  return (data ?? []).map(mapInvite);
}

export async function listOutgoingInvites(workbookId: string): Promise<InviteRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("nudge_invites")
    .select("*")
    .eq("workbook_id", workbookId)
    .eq("status", "pending");
  if (error) throw error;
  return (data ?? []).map(mapInvite);
}

async function loadInvite(by: { code?: string; id?: string }): Promise<InviteRow | null> {
  const supabase = getSupabaseAdmin();
  let q = supabase.from("nudge_invites").select("*, expires_at").eq("status", "pending");
  q = by.code ? q.eq("code", by.code.trim().toUpperCase()) : q.eq("id", by.id!);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const expiresAt = (data as Record<string, unknown>).expires_at as string | null;
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) return null;
  return mapInvite(data);
}

/**
 * Accept an invite. `adopt`: joiner joins the inviter's workbook (their old membership is
 * removed → old data set aside). `fresh`: a NEW workbook is created with both as members
 * (inviter owner); both prior memberships are removed. Never merges data.
 */
export async function acceptInvite(
  joinerUserId: string,
  mode: AcceptMode,
  by: { code?: string; id?: string },
  todayIso: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();
  const invite = await loadInvite(by);
  if (!invite) return { ok: false, error: "Invite not found or already used." };
  if (invite.inviterUserId === joinerUserId) return { ok: false, error: "You can't accept your own invite." };
  if (invite.inviteeUserId && invite.inviteeUserId !== joinerUserId) {
    return { ok: false, error: "This invite was issued to a different account." };
  }

  await supabase.from("nudge_profiles").upsert({ whop_user_id: joinerUserId }, { onConflict: "whop_user_id" });

  if (mode === "adopt") {
    if ((await workbookMemberCount(invite.workbookId)) >= MAX_MEMBERS) {
      return { ok: false, error: "This budget already has two members." };
    }
    // Insert joiner into inviter's workbook FIRST (idempotent), then remove other memberships.
    const { error: insErr } = await supabase
      .from("nudge_workbook_members")
      .upsert({ workbook_id: invite.workbookId, whop_user_id: joinerUserId, role: "member" }, { onConflict: "workbook_id,whop_user_id" });
    if (insErr) return { ok: false, error: insErr.message };
    await supabase.from("nudge_workbook_members").delete().eq("whop_user_id", joinerUserId).neq("workbook_id", invite.workbookId);
  } else {
    // fresh: new workbook, both members, both old memberships removed.
    const { data: wb, error: wbErr } = await supabase
      .from("nudge_workbooks")
      .insert({ whop_user_id: invite.inviterUserId, period_anchor_day: 1 })
      .select("id")
      .single();
    if (wbErr) return { ok: false, error: wbErr.message };
    const newWorkbookId = wb.id as string;
    await supabase.from("nudge_workbook_members").delete().eq("whop_user_id", invite.inviterUserId);
    await supabase.from("nudge_workbook_members").delete().eq("whop_user_id", joinerUserId);
    const { error: memErr } = await supabase.from("nudge_workbook_members").insert([
      { workbook_id: newWorkbookId, whop_user_id: invite.inviterUserId, role: "owner" },
      { workbook_id: newWorkbookId, whop_user_id: joinerUserId, role: "member" },
    ]);
    if (memErr) return { ok: false, error: memErr.message };
    await ensureCurrentPeriod(newWorkbookId, 1, todayIso);
  }

  await supabase.from("nudge_invites").update({ status: "accepted", invitee_user_id: joinerUserId }).eq("id", invite.id);
  return { ok: true };
}

export async function respondToInvite(
  inviteId: string,
  action: "decline" | "revoke",
  ctx: { userId: string; workbookId: string },
): Promise<{ ok: boolean }> {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from("nudge_invites")
    .update({ status: action === "decline" ? "declined" : "revoked" })
    .eq("id", inviteId)
    .eq("status", "pending");
  // decline: only the invited user may decline; revoke: only the inviting workbook may revoke.
  q = action === "decline" ? q.eq("invitee_user_id", ctx.userId) : q.eq("workbook_id", ctx.workbookId);
  const { data, error } = await q.select("id");
  if (error) throw error;
  return { ok: (data?.length ?? 0) > 0 };
}
