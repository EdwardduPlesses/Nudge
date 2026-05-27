# Workstream A — Sharing & Invites Implementation Plan

> **For agentic workers:** Implement task-by-task with TDD. Depends on the merged Foundation.

**Goal:** Let a user invite ONE other person (by Whop username or by share code) to co-own their budget workbook; on accept the joiner chooses to **adopt** the inviter's workbook or start **fresh**; never merge. Enforce a 2-member cap.

**Branch:** `feat/sharing-invites` (off `main`).

**Foundation facts this builds on:**
- `nudge_invites(id, workbook_id, inviter_user_id, code unique, invitee_username, invitee_user_id, status[pending|accepted|declined|revoked|expired], created_at, expires_at)` exists.
- `nudge_workbook_members(workbook_id, whop_user_id, role[owner|member], display_name, color, joined_at)` exists.
- `src/lib/budget/workbook-access.ts`: `ensureActiveWorkbook(userId)`, `listMemberships(userId)`, `pickActiveWorkbookId(...)`, `userIsWorkbookMember(userId, workbookId)`.
- `src/app/api/_shared/workbook-mutation.ts`: `resolveMutationContext()` → `{userId, workbookId} | null`.
- Whop SDK: `whopsdk.users.list({ query })` → async-paginated `{id, username, name}`; `whopsdk.users.retrieve(id)`.
- Period creation: `ensureCurrentPeriod(workbookId, anchorDay, todayIso)` from `@/lib/budget/period-repo`.
- The app shell `src/components/nudge/nudge-app.tsx` renders a top bar with an `actions` slot.

---

## Task A1: Sharing server module

**Files:** Create `src/lib/budget/sharing.ts`, `src/lib/budget/sharing.test.ts`.

- [ ] **Step 1 — failing tests (pure helpers):**
```ts
import { expect, test } from "vitest";
import { generateInviteCode, pickExactUsernameMatch, isValidAcceptMode } from "./sharing";

test("generateInviteCode is 8 uppercase alphanumerics, no ambiguous chars", () => {
  for (let i = 0; i < 50; i++) {
    const c = generateInviteCode();
    expect(c).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  }
});

test("pickExactUsernameMatch is case-insensitive exact, ignores partials", () => {
  const rows = [{ id: "u1", username: "Sarah" }, { id: "u2", username: "sarah_b" }];
  expect(pickExactUsernameMatch(rows, "sarah")?.id).toBe("u1");
  expect(pickExactUsernameMatch(rows, "nope")).toBeNull();
});

test("isValidAcceptMode only allows adopt/fresh", () => {
  expect(isValidAcceptMode("adopt")).toBe(true);
  expect(isValidAcceptMode("fresh")).toBe(true);
  expect(isValidAcceptMode("merge")).toBe(false);
});
```
- [ ] **Step 2 — run, confirm FAIL.**
- [ ] **Step 3 — implement `sharing.ts`:**
```ts
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
    const page = await whopsdk.users.list({ query: username.trim().replace(/^@/, "") });
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
  let q = supabase.from("nudge_invites").select("*").eq("status", "pending");
  q = by.code ? q.eq("code", by.code.trim().toUpperCase()) : q.eq("id", by.id!);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data ? mapInvite(data) : null;
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
    // Remove joiner's existing memberships (set aside), then join inviter's workbook.
    await supabase.from("nudge_workbook_members").delete().eq("whop_user_id", joinerUserId);
    const { error: insErr } = await supabase
      .from("nudge_workbook_members")
      .insert({ workbook_id: invite.workbookId, whop_user_id: joinerUserId, role: "member" });
    if (insErr) return { ok: false, error: insErr.message };
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

export async function setInviteStatus(inviteId: string, status: "declined" | "revoked"): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("nudge_invites").update({ status }).eq("id", inviteId);
  if (error) throw error;
}
```
- [ ] **Step 4 — run tests, confirm 3 passed; `npx tsc --noEmit` shows no new errors from this file.**
- [ ] **Step 5 — commit:** `feat(sharing): invite/accept server module with tests`.

> NOTE on atomicity: `acceptInvite` performs several writes without a DB transaction (Supabase JS has no multi-statement tx). For a 2-person household this is acceptable; the operations are ordered so the worst case (a crash mid-accept) leaves the joiner removed from their old workbook but added to the new one — recoverable. Document this in the commit body. A Postgres RPC could be a later hardening.

---

## Task A2: Invite & members API routes

**Files:** Create `src/app/api/invites/route.ts`, `src/app/api/invites/accept/route.ts`, `src/app/api/invites/respond/route.ts`, `src/app/api/members/route.ts`.

- [ ] **Step 1 — `src/app/api/invites/route.ts`** (POST create, GET list incoming+outgoing+members summary):
```ts
import { NextResponse } from "next/server";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";
import { createInvite, listIncomingInvites, listOutgoingInvites } from "@/lib/budget/sharing";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const ctx = await resolveMutationContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const method = body.method === "username" ? "username" : "code";
  const res = await createInvite(ctx.workbookId, ctx.userId, method, body.username);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ invite: res.invite });
}

export async function GET() {
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const ctx = await resolveMutationContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [incoming, outgoing] = await Promise.all([
    listIncomingInvites(ctx.userId),
    listOutgoingInvites(ctx.workbookId),
  ]);
  return NextResponse.json({ incoming, outgoing });
}
```
- [ ] **Step 2 — `src/app/api/invites/accept/route.ts`:**
```ts
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { acceptInvite, isValidAcceptMode } from "@/lib/budget/sharing";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const [hdrs, cks] = await Promise.all([headers(), cookies()]);
  const u = await getCurrentUser(hdrs, cks);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!isValidAcceptMode(body.mode)) return NextResponse.json({ error: "mode must be adopt or fresh" }, { status: 400 });
  if (!body.code && !body.inviteId) return NextResponse.json({ error: "code or inviteId required" }, { status: 400 });
  const todayIso = new Date().toISOString().slice(0, 10);
  const res = await acceptInvite(u.userId, body.mode, { code: body.code, id: body.inviteId }, todayIso);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
```
> NOTE: accept does NOT use `resolveMutationContext` (which would auto-create/scope the joiner's own workbook); it only needs the verified user id.
- [ ] **Step 3 — `src/app/api/invites/respond/route.ts`** (decline incoming / revoke outgoing):
```ts
import { NextResponse } from "next/server";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";
import { setInviteStatus } from "@/lib/budget/sharing";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const ctx = await resolveMutationContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.inviteId || (body.action !== "decline" && body.action !== "revoke")) {
    return NextResponse.json({ error: "inviteId + action(decline|revoke) required" }, { status: 400 });
  }
  await setInviteStatus(body.inviteId, body.action === "decline" ? "declined" : "revoked");
  return NextResponse.json({ ok: true });
}
```
- [ ] **Step 4 — `src/app/api/members/route.ts`** (GET members of caller's workbook):
```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const ctx = await resolveMutationContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("nudge_workbook_members")
    .select("whop_user_id, role, display_name, color, joined_at")
    .eq("workbook_id", ctx.workbookId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ members: data ?? [] });
}
```
- [ ] **Step 5 — `npx tsc --noEmit` clean for new files; commit:** `feat(api): invite + members routes`.

---

## Task A3: Sharing dialog UI + entry point

**Files:** Create `src/components/nudge/sharing-dialog.tsx`. Modify `src/components/nudge/nudge-app.tsx` (add a "Share" trigger in the top-bar `actions` and in the mobile masthead actions).

- [ ] **Step 1 — Read `src/components/nudge/add-transaction-dialog.tsx`** to match the frosted-ui `Dialog`/`Button`/`TextField` pattern, spacing, and class conventions (`docs/nudge-ui-standards.md`).
- [ ] **Step 2 — Build `SharingDialog`** (client component). Behavior:
  - On open, `GET /api/invites` and `GET /api/members`; show a loading state.
  - **Members section:** list members (name or shortened user id; mark the owner; show "you").
  - **Invite section** (only if member count < 2 and no pending outgoing): a tab/segmented control "By username" | "By code".
    - Username: a `TextField` + "Send invite" → `POST /api/invites {method:'username', username}`. Show returned errors inline. On success show "Invite sent to @username" and the share code as a fallback.
    - Code: "Generate code" → `POST /api/invites {method:'code'}` → show the code with a copy button.
  - **Pending outgoing** (if any): show code + "Revoke" → `POST /api/invites/respond {inviteId, action:'revoke'}`.
  - **Incoming invites:** for each, show "@inviter invited you" with two actions, each opening an adopt/fresh choice (radio or two buttons): **Use their budget** (adopt) / **Start fresh** (fresh) → `POST /api/invites/accept {inviteId, mode}`; and **Decline** → `POST /api/invites/respond {inviteId, action:'decline'}`.
  - After a successful accept, call `window.location.reload()` (membership-scoped data must reload).
  - Use `nudgeBudgetFetchInit`-style auth: the dialog must send the whop token. Read how `nudge-budget-context.tsx` builds `nudgeBudgetFetchInit`; export a small `useNudgeBudget()`-adjacent helper OR accept the `whopUserToken` via context. Simplest: add `whopUserToken: string | null` to the budget context value (set from provider props) and a `currentUserId` (already added in Foundation) so the dialog can build authed requests. If you add `whopUserToken` to the context, update the context type + value accordingly.
- [ ] **Step 3 — Add the trigger** in `nudge-app.tsx`: a "Share" button (frosted-ui `Button` variant matching the top bar) in the `actions` slot before the divider, and a matching control in the mobile masthead actions. Clicking opens `SharingDialog`.
- [ ] **Step 4 — `npx tsc --noEmit && npm run build`** must pass. Manually reason through the dialog states.
- [ ] **Step 5 — commit:** `feat(ui): sharing dialog + entry point`.

---

## Task A4: Validate & merge

- [ ] **Step 1 —** `npm run lint` (no NEW errors vs the main baseline of 13), `npx tsc --noEmit`, `npm run build`, `npm run test` (period-math + workbook-access + sharing tests green).
- [ ] **Step 2 —** No new migration is needed (Foundation created `nudge_invites`). If any schema change crept in, STOP and report.
- [ ] **Step 3 — merge:** `git checkout main && git merge --no-ff feat/sharing-invites && git push origin main`.

## Self-review (A)
- Spec §2 (both invite methods) → A1 `createInvite` + A2 routes + A3 UI. ✓
- Spec §3 (adopt/fresh, never merge, 2-member cap) → `acceptInvite` modes + `MAX_MEMBERS`. ✓
- Username lookup uses the verified Whop SDK `users.list({query})` + exact match. ✓
- No data merging anywhere. ✓
