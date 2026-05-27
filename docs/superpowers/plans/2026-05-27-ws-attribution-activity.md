# Workstream C — Attribution, Activity Feed & Per-Person Dashboards

> Implement task-by-task. Depends on merged Foundation + A + B.

**Goal:** Make "who did what" visible: attribution chips on transactions, a change-feed timeline (`nudge_activity`), a mine/theirs/both person filter on the Activity tab and Dashboard, and per-person income shown separately with a combined total.

**Branch:** `feat/attribution-activity` (off `main`).

**Foundation facts:**
- `nudge_activity(id, workbook_id, actor_user_id, action, entity_type, entity_id, summary, metadata, created_at)` exists.
- `created_by` is on transactions/categories/goals; loader returns it; context stamps it on add.
- `state.members: {whopUserId, role, displayName, color}[]`; `state.memberIncomes: {whopUserId, plannedAmount}[]`; `state.editable`; `currentUserId` from `useNudgeBudget()`.
- Per-item routes exist under `src/app/api/{transactions,categories,goals,period-incomes,period-category-limits}/route.ts`, each using `resolveMutationContext()` → `{userId, workbookId}`.
- `whopsdk.users.retrieve(id)` → `{id, username, name}`.
- Loader: `src/lib/budget/supabase-persistence.ts` `loadWorkbookMeta(workbookId)` builds `members`.

---

## Task C1: Activity log + member enrichment (server)

**Files:** Create `src/lib/budget/activity.ts`; modify the 5 per-item route files; create `src/app/api/activity/route.ts`; modify `src/lib/budget/supabase-persistence.ts` and `src/app/api/members/route.ts` to enrich members.

- [ ] **Step 1 — create `src/lib/budget/activity.ts`:**
```ts
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
  const out: EnrichedMember[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    let displayName = (r.display_name as string) ?? null;
    let color = (r.color as string) ?? null;
    const patch: Record<string, unknown> = {};
    if (!displayName) {
      try {
        const u = await whopsdk.users.retrieve(r.whop_user_id as string);
        displayName = u.username ?? u.name ?? null;
      } catch {
        displayName = null;
      }
      if (displayName) patch.display_name = displayName;
    }
    if (!color) {
      color = MEMBER_PALETTE[i % MEMBER_PALETTE.length];
      patch.color = color;
    }
    if (Object.keys(patch).length > 0) {
      await supabase.from("nudge_workbook_members").update(patch).eq("workbook_id", workbookId).eq("whop_user_id", r.whop_user_id as string);
    }
    out.push({ whopUserId: r.whop_user_id as string, role: (r.role as string) ?? "member", displayName, color });
  }
  return out;
}
```

- [ ] **Step 2 — wire `logActivity` into each per-item route** (additive; after the successful DB write, before returning success). Add `import { logActivity } from "@/lib/budget/activity";`. Use concise human summaries; include amounts/names where the body has them. Examples:
  - transactions POST: `await logActivity(workbookId, userId, "created", "transaction", id, \`added a \${body.type === "income" ? "income" : "expense"} of \${Number(body.amount ?? 0)}\`);`
  - transactions PATCH: `"updated"`, `"transaction"`, `body.id`, "edited a transaction".
  - transactions DELETE: `"deleted"`, `"transaction"`, id, "removed a transaction".
  - categories POST/PATCH/DELETE: summaries like "added category X" / "renamed a category" / "removed a category".
  - goals POST/PATCH/DELETE: "created goal X" / "updated a goal" / "removed a goal".
  - period-incomes PATCH: "updated planned income".
  - period-category-limits PATCH: "changed a category limit".
  Keep `userId`/`workbookId` from the route's existing `ctx`. Do not change existing logic; only add the log call (and import). For routes that don't currently destructure `userId` (e.g. limits/incomes use only `c.workbookId`), use `c.userId` for the actor.
- [ ] **Step 3 — create `src/app/api/activity/route.ts`:**
```ts
import { NextResponse } from "next/server";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";
import { listActivity } from "@/lib/budget/activity";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const ctx = await resolveMutationContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const actor = url.searchParams.get("actor");
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const items = await listActivity(ctx.workbookId, { actorUserId: actor, limit });
  return NextResponse.json({ items });
}
```
- [ ] **Step 4 — enrich members**: in `src/lib/budget/supabase-persistence.ts` `loadWorkbookMeta`, replace the direct member query with a call to `ensureMemberProfiles(workbookId)` (mapping `EnrichedMember` → the `Member` type; `color` is now always a string, keep `Member.color: string | null` compatible). In `src/app/api/members/route.ts` GET, return `await ensureMemberProfiles(ctx.workbookId)` instead of the raw select. Import from `@/lib/budget/activity`.
- [ ] **Step 5 — verify** `npx tsc --noEmit` clean; build passes. **Commit:** `feat(activity): activity log, feed API, member enrichment + route wiring`.

---

## Task C2: Client — attribution chips, person filter, activity feed, per-person income

**Files:** Create `src/components/nudge/member-badge.tsx`, `src/components/nudge/activity-feed.tsx`. Modify `src/components/nudge/activity-tab.tsx`, `src/components/nudge/dashboard-tab.tsx`, `src/components/nudge/budgets-tab.tsx`. Add a small selector to `src/lib/budget/selectors.ts`.

- [ ] **Step 1 — selector** in `src/lib/budget/selectors.ts`:
```ts
import type { BudgetState, Transaction } from "./types";
export function transactionsByActor(
  txs: Transaction[],
  filter: { mode: "all" | "user"; userId?: string },
): Transaction[] {
  if (filter.mode === "all" || !filter.userId) return txs;
  return txs.filter((t) => t.createdBy === filter.userId);
}
export function memberLabel(members: BudgetState["members"], userId: string | null): string {
  if (!userId) return "Someone";
  const m = members.find((x) => x.whopUserId === userId);
  return m?.displayName ?? `${userId.slice(0, 6)}…`;
}
```
- [ ] **Step 2 — `MemberBadge`** (`member-badge.tsx`): given `userId`, read `state.members` + `currentUserId` from `useNudgeBudget()`, render a small chip with the member's color dot + label (`memberLabel`), appending " (you)" when `userId === currentUserId`. Reuse `atelier-chip` styling. If only ONE member exists in the workbook, the badge should render nothing (solo mode — attribution is noise).
- [ ] **Step 3 — attribution on transactions**: in `activity-tab.tsx`, render `<MemberBadge userId={t.createdBy} />` in each row's chip line (next to the type/date chips). Add a **person filter**: a third filter group "Who" with pills All / <member A> / <member B> (build from `state.members`; hide the whole group when members.length < 2). Apply via `transactionsByActor` in the existing `filtered` memo.
- [ ] **Step 4 — `ActivityFeed`** (`activity-feed.tsx`): on mount fetch `GET /api/activity` (authed via `nudgeBudgetFetchInit(whopUserToken,…)` from context; if a load-on-mount `set-state-in-effect` lint fires, scope-disable with a comment). Render a compact timeline: each item shows `<MemberBadge userId={item.actorUserId}/>` + `item.summary` + relative time (date-fns `formatDistanceToNow`). Respect a `filterUserId?: string` prop (refetch with `?actor=`). Empty state: "No activity yet." Place `<ActivityFeed />` as a section at the TOP of `activity-tab.tsx` under a "Recent changes" `eyebrow` heading, above the transactions list. (Solo workbook: still show it; attribution badges simply read "you".)
- [ ] **Step 5 — dashboard person filter**: in `dashboard-tab.tsx`, add a small "Who" pill group (All / member A / member B), hidden when members.length < 2. Apply `transactionsByActor(state.transactions, …)` to the transactions BEFORE the existing dashboard computations (find where `state.transactions` feeds the cards and wrap it). Keep all existing cards working; the filter narrows the spend/velocity/category figures to the selected person (income totals stay whole-household).
- [ ] **Step 6 — per-person income** in `budgets-tab.tsx`: replace the single income input with a per-member display: for each `state.members`, show their `memberLabel` + their `memberIncomes` amount; the row for `currentUserId` is an editable `TextField` calling `setMemberIncome(currentUserId, n)`, other members' rows are read-only text. Below, show "Household total" = `totalPlannedIncome(state)`. Keep disabled when `!state.editable`. If only one member, behave like the current single input.
- [ ] **Step 7 — verify** `npx tsc --noEmit && npm run build`; lint ≤ baseline (scope-disable any new set-state-in-effect). **Commit:** `feat(ui): attribution chips, activity feed, person filter, per-person income`.

---

## Task C3: Validate & merge

- [ ] `npm run test`, `npx tsc --noEmit`, `npm run build`, `npm run lint` (≤ 13 problems). No migration needed (nudge_activity exists).
- [ ] **merge:** `git checkout main && git merge --no-ff feat/attribution-activity && git push origin main`.

## Self-review (C)
- Spec §6 attribution (transactions + goals/categories via created_by already stored) → MemberBadge + activity summaries. ✓
- Activity feed → `nudge_activity` + listActivity + ActivityFeed. ✓
- Filter by person (dashboard + activity) → `transactionsByActor` applied in both. ✓
- Per-person income separate + total → C2 Step 6. ✓
