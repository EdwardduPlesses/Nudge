# Standalone App Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone web entrypoint at `/app` backed by Whop OAuth + a session cookie, while keeping the existing `/experiences/[experienceId]` iframe flow working. Collapse data to one workbook per user, regardless of entrypoint.

**Architecture:** A single `getCurrentUserId(headers, cookies)` resolver becomes the only way server code obtains the user — iframe token first, then session cookie, then dev fallback. The Supabase schema drops `experience_id` from the workbook key. Whop OAuth uses Whop's `/oauth/authorize` + `/oauth/token` endpoints directly (the SDK has no OAuth helpers). Sessions are signed JWTs in `httpOnly` cookies.

**Tech Stack:** Next.js 16 App Router, React 19, `@whop/sdk` 0.0.38, Supabase (Postgres + service role), Node `crypto` for JWT signing (no new deps), TypeScript.

**Spec:** `docs/superpowers/specs/2026-05-26-standalone-app-mode-design.md`.

**Testing note:** The codebase currently has no test framework installed (no Jest/Vitest), and adding one is out of scope for this feature. Verification at each checkpoint uses:
- `npm run lint` — must pass.
- `npx tsc --noEmit` — must pass (TypeScript build check; this is what `next build` runs internally).
- Manual smoke tests via `npm run dev` (the Whop proxy on port 3001), called out per-task.

If a task is purely a unit-testable concern (JWT round-trip), the verification is a one-off script run via `node --experimental-strip-types` instead of a permanent test file.

**Commit cadence:** commit after each task unless the task says otherwise. Use Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`).

---

## Pre-flight (do these once before Task 1)

- [ ] **P1: Verify clean working tree**

```bash
git status
```
Expected: clean. If not, stop and decide whether to stash or proceed.

- [ ] **P2: Confirm dev server starts on the current `main`**

```bash
npm run dev
```
Expected: prints something like `whop-proxy listening on http://localhost:3001`. Then open `http://localhost:3001/experiences/dev` and confirm the app renders. Ctrl-C to stop.

- [ ] **P3: Pull current Supabase constraint name for the migration**

If you have local Supabase CLI access and a linked project, run:
```bash
npx supabase db diff --schema public --linked --use-pg-schema | head -200
```
Otherwise, open the Supabase dashboard SQL editor and run:
```sql
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.nudge_workbooks'::regclass
  AND contype = 'u';
```
Expected: exactly one row, name like `nudge_workbooks_experience_id_whop_user_id_key`. **Record the exact name** — Task 1 uses it. If your environment doesn't have the constraint named that way, substitute your actual name in the migration.

---

## Task 1: Schema migration — one workbook per user

**Files:**
- Create: `supabase/migrations/20260526120000_nudge_workbook_per_user.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Collapse nudge_workbooks to one per user (drop experience_id from the key).
-- Pre-step: for users with multiple workbooks, keep only the most recently updated.
-- Children (nudge_categories, nudge_transactions, nudge_goals) cascade on workbook_id.

begin;

-- 1. Keep newest workbook per user, delete the others.
with ranked as (
  select id,
         row_number() over (
           partition by whop_user_id
           order by updated_at desc, id desc
         ) as rn
  from public.nudge_workbooks
)
delete from public.nudge_workbooks
where id in (select id from ranked where rn > 1);

-- 2. Drop the (experience_id, whop_user_id) unique constraint.
--    The exact constraint name was recorded in pre-flight step P3.
alter table public.nudge_workbooks
  drop constraint if exists nudge_workbooks_experience_id_whop_user_id_key;

-- 3. Drop the experience_id column.
alter table public.nudge_workbooks
  drop column if exists experience_id;

-- 4. Drop the old composite index (if it survived the column drop).
drop index if exists public.nudge_workbooks_exp_user_idx;

-- 5. Enforce one workbook per user.
alter table public.nudge_workbooks
  add constraint nudge_workbooks_whop_user_id_key unique (whop_user_id);

commit;
```

- [ ] **Step 2: Apply the migration**

```bash
npm run db:push
```
Expected: prints `Applying migration 20260526120000_nudge_workbook_per_user.sql...` and exits 0. If it fails because the constraint name differs, edit the SQL with the name from P3 and re-run.

- [ ] **Step 3: Verify the schema**

In Supabase SQL editor (or `psql`):
```sql
\d public.nudge_workbooks
```
Expected: no `experience_id` column; a unique constraint on `whop_user_id` only.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260526120000_nudge_workbook_per_user.sql
git commit -m "feat(db): collapse nudge_workbooks to one per user"
```

---

## Task 2: Update budget persistence to drop `experienceId`

**Files:**
- Modify: `src/lib/budget/supabase-persistence.ts`

- [ ] **Step 1: Rewrite `fetchBudgetStateFromSupabase` and `replaceBudgetStateInSupabase`**

Replace the file body with:

```typescript
import type { BudgetState, Category, Goal, Transaction } from "./types";
import { defaultBudgetState } from "./defaults";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type WorkbookRow = {
  id: string;
  income_plan: number;
};

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function mapCategory(r: {
  id: string;
  name: string;
  budget_limit: number;
  color: string;
}): Category {
  return {
    id: r.id,
    name: r.name,
    budgetLimit: num(r.budget_limit),
    color: r.color,
  };
}

function mapTransaction(r: {
  id: string;
  date: string;
  amount: number;
  type: string;
  category_id: string | null;
  goal_id?: string | null;
  note: string;
}): Transaction {
  const t = r.type === "income" ? "income" : "expense";
  const gid = r.goal_id;
  return {
    id: r.id,
    date: r.date,
    amount: num(r.amount),
    type: t,
    categoryId: r.category_id,
    goalId: gid === null || typeof gid === "string" ? gid : null,
    note: r.note ?? "",
  };
}

function mapGoal(r: {
  id: string;
  name: string;
  target_amount: number;
  saved_amount: number;
  deadline: string | null;
}): Goal {
  return {
    id: r.id,
    name: r.name,
    targetAmount: num(r.target_amount),
    savedAmount: num(r.saved_amount),
    deadline: r.deadline,
  };
}

export async function fetchBudgetStateFromSupabase(
  whopUserId: string,
): Promise<BudgetState | null> {
  const supabase = getSupabaseAdmin();
  const { data: wb, error: wbErr } = await supabase
    .from("nudge_workbooks")
    .select("id, income_plan")
    .eq("whop_user_id", whopUserId)
    .maybeSingle();

  if (wbErr) throw wbErr;
  if (!wb) return null;

  const wbRow = wb as WorkbookRow;
  const workbookId = wbRow.id;

  const [catRes, txRes, goalRes] = await Promise.all([
    supabase.from("nudge_categories").select("id, name, budget_limit, color").eq("workbook_id", workbookId),
    supabase
      .from("nudge_transactions")
      .select("id, date, amount, type, category_id, goal_id, note")
      .eq("workbook_id", workbookId),
    supabase.from("nudge_goals").select("id, name, target_amount, saved_amount, deadline").eq("workbook_id", workbookId),
  ]);

  if (catRes.error) throw catRes.error;
  if (txRes.error) throw txRes.error;
  if (goalRes.error) throw goalRes.error;

  const categories = (catRes.data ?? []).map(mapCategory);
  const transactions = (txRes.data ?? []).map(mapTransaction);
  const goals = (goalRes.data ?? []).map(mapGoal);

  const base = defaultBudgetState();
  return {
    incomePlan: num(wbRow.income_plan, base.incomePlan),
    categories: categories.length > 0 ? categories : base.categories,
    transactions,
    goals,
  };
}

export async function replaceBudgetStateInSupabase(
  whopUserId: string,
  state: BudgetState,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error: profileErr } = await supabase.from("nudge_profiles").upsert(
    { whop_user_id: whopUserId },
    { onConflict: "whop_user_id" },
  );
  if (profileErr) throw profileErr;

  const { data: wbUpsert, error: wbUpsertErr } = await supabase
    .from("nudge_workbooks")
    .upsert(
      {
        whop_user_id: whopUserId,
        income_plan: state.incomePlan,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "whop_user_id" },
    )
    .select("id")
    .single();

  if (wbUpsertErr) throw wbUpsertErr;
  const workbookId = wbUpsert.id as string;

  const { error: delTx } = await supabase.from("nudge_transactions").delete().eq("workbook_id", workbookId);
  if (delTx) throw delTx;
  const { error: delGoals } = await supabase.from("nudge_goals").delete().eq("workbook_id", workbookId);
  if (delGoals) throw delGoals;
  const { error: delCat } = await supabase.from("nudge_categories").delete().eq("workbook_id", workbookId);
  if (delCat) throw delCat;

  if (state.categories.length > 0) {
    const { error: catIns } = await supabase.from("nudge_categories").insert(
      state.categories.map((c) => ({
        id: c.id,
        workbook_id: workbookId,
        name: c.name,
        budget_limit: c.budgetLimit,
        color: c.color,
      })),
    );
    if (catIns) throw catIns;
  }

  if (state.goals.length > 0) {
    const { error: goalIns } = await supabase.from("nudge_goals").insert(
      state.goals.map((g) => ({
        id: g.id,
        workbook_id: workbookId,
        name: g.name,
        target_amount: g.targetAmount,
        saved_amount: g.savedAmount,
        deadline: g.deadline,
      })),
    );
    if (goalIns) throw goalIns;
  }

  if (state.transactions.length > 0) {
    const { error: txIns } = await supabase.from("nudge_transactions").insert(
      state.transactions.map((t) => ({
        id: t.id,
        workbook_id: workbookId,
        date: t.date,
        amount: t.amount,
        type: t.type,
        category_id: t.categoryId,
        goal_id: t.goalId,
        note: t.note,
      })),
    );
    if (txIns) throw txIns;
  }
}
```

Both functions now take only `whopUserId`. Callers will be updated in Tasks 5–6; expect type errors until then.

- [ ] **Step 2: Do NOT typecheck or commit yet** — callers are still broken. Continue to Task 3 in the same uncommitted state. (Frequent commits is the rule; this is the rare exception because the change spans tightly-coupled files. We commit at the end of Task 6.)

---

## Task 3: Session library (JWT encode/decode using Node crypto)

**Files:**
- Create: `src/lib/auth/session.ts`

- [ ] **Step 1: Write the session helpers**

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal HS256 JWT for first-party cookies. We do NOT use a JWT library —
 * single-issuer, single-audience, and a stable secret is all we need.
 */

export type NudgeSessionClaims = {
  sub: string;          // whop_user_id
  iat: number;          // seconds since epoch
  exp: number;          // seconds since epoch
  gate_checked_at: number; // seconds since epoch — last standalone-gate pass
};

export type NudgeOAuthStateClaims = {
  state: string;        // random CSRF token
  next: string;         // post-callback redirect path (must be same-origin)
  iat: number;
  exp: number;
};

function getSecret(): Buffer {
  const s = process.env.NUDGE_SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("NUDGE_SESSION_SECRET must be set and at least 32 chars");
  }
  return Buffer.from(s, "utf8");
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(input: string): string {
  return b64url(createHmac("sha256", getSecret()).update(input).digest());
}

function encode<T extends object>(claims: T): string {
  const header = b64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64url(Buffer.from(JSON.stringify(claims)));
  const signingInput = `${header}.${payload}`;
  return `${signingInput}.${sign(signingInput)}`;
}

function decode<T>(token: string): T | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = sign(`${header}.${payload}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  try {
    const json = b64urlDecode(payload).toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function encodeNudgeSession(claims: Omit<NudgeSessionClaims, "iat" | "exp">, ttlSeconds = 30 * 24 * 3600): string {
  const iat = Math.floor(Date.now() / 1000);
  return encode<NudgeSessionClaims>({ ...claims, iat, exp: iat + ttlSeconds });
}

export function decodeNudgeSession(token: string): NudgeSessionClaims | null {
  const c = decode<NudgeSessionClaims>(token);
  if (!c) return null;
  if (typeof c.sub !== "string" || typeof c.exp !== "number") return null;
  if (c.exp <= Math.floor(Date.now() / 1000)) return null;
  return c;
}

export function encodeOAuthState(claims: Omit<NudgeOAuthStateClaims, "iat" | "exp">, ttlSeconds = 10 * 60): string {
  const iat = Math.floor(Date.now() / 1000);
  return encode<NudgeOAuthStateClaims>({ ...claims, iat, exp: iat + ttlSeconds });
}

export function decodeOAuthState(token: string): NudgeOAuthStateClaims | null {
  const c = decode<NudgeOAuthStateClaims>(token);
  if (!c) return null;
  if (typeof c.state !== "string" || typeof c.next !== "string") return null;
  if (c.exp <= Math.floor(Date.now() / 1000)) return null;
  return c;
}

export const NUDGE_SESSION_COOKIE = "nudge_session";
export const NUDGE_OAUTH_STATE_COOKIE = "nudge_oauth_state";
```

- [ ] **Step 2: Run a one-off round-trip check**

Create a temporary script `scratch-session-check.mjs` at the repo root with:
```javascript
process.env.NUDGE_SESSION_SECRET = "x".repeat(64);
const mod = await import("./src/lib/auth/session.ts");
const tok = mod.encodeNudgeSession({ sub: "user_abc", gate_checked_at: Math.floor(Date.now() / 1000) });
console.log("token length", tok.length);
const dec = mod.decodeNudgeSession(tok);
console.log("decoded", dec);
if (!dec || dec.sub !== "user_abc") throw new Error("round-trip failed");
const tampered = tok.slice(0, -2) + (tok.endsWith("aa") ? "bb" : "aa");
if (mod.decodeNudgeSession(tampered) !== null) throw new Error("tampered token accepted");
console.log("OK");
```

Run:
```bash
node --experimental-strip-types scratch-session-check.mjs
```
Expected: `OK`. (If `--experimental-strip-types` isn't supported on your Node, transpile inline with `npx tsx scratch-session-check.mjs`.)

- [ ] **Step 3: Delete the scratch script**

```bash
rm scratch-session-check.mjs
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth/session.ts
git commit -m "feat(auth): add HS256 session + OAuth-state encode/decode"
```

---

## Task 4: `getCurrentUserId` resolver

**Files:**
- Create: `src/lib/auth/current-user.ts`
- Modify: `src/lib/nudge-dev-preview.ts` (deprecate `resolveNudgeUserIdForBudgetApi`; keep export for now)

- [ ] **Step 1: Write the resolver**

```typescript
import type { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { whopsdk } from "@/lib/whop-sdk";
import { NUDGE_DEV_PREVIEW_USER_ID, devStrictWhop } from "@/lib/nudge-dev-preview";
import { NUDGE_SESSION_COOKIE, decodeNudgeSession } from "@/lib/auth/session";

export type CurrentUser =
  | { userId: string; source: "whop-iframe" }
  | { userId: string; source: "standalone-session"; gateCheckedAt: number }
  | { userId: string; source: "dev-preview" }
  | null;

/**
 * Resolve the current user across both surfaces. Order of precedence:
 *   1. x-whop-user-token (Whop iframe) → verifyUserToken.
 *   2. nudge_session cookie → HS256 verify.
 *   3. Dev preview fallback (NODE_ENV=development and NUDGE_STRICT_WHOP != "1").
 */
export async function getCurrentUser(
  headers: ReadonlyHeaders | Headers,
  cookies: ReadonlyRequestCookies | { get: (n: string) => { value: string } | undefined },
): Promise<CurrentUser> {
  const iframeToken = headers.get("x-whop-user-token");
  if (iframeToken) {
    const auth = await whopsdk.verifyUserToken(headers, { dontThrow: true });
    if (auth?.userId) return { userId: auth.userId, source: "whop-iframe" };
  }

  const sessionCookie = cookies.get(NUDGE_SESSION_COOKIE)?.value;
  if (sessionCookie) {
    const claims = decodeNudgeSession(sessionCookie);
    if (claims) {
      return {
        userId: claims.sub,
        source: "standalone-session",
        gateCheckedAt: claims.gate_checked_at,
      };
    }
  }

  if (process.env.NODE_ENV === "development" && !devStrictWhop()) {
    return { userId: NUDGE_DEV_PREVIEW_USER_ID, source: "dev-preview" };
  }

  return null;
}
```

Note: `whopsdk.verifyUserToken` already accepts a `Headers`-shaped object today; matching that signature here keeps callers identical.

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors related to `src/lib/auth/current-user.ts`. Existing errors in callers from Task 2 are still present; ignore those for now. If `current-user.ts` itself has errors, fix them before continuing.

- [ ] **Step 3: Commit (along with Task 2's pending changes)**

We held Task 2's changes uncommitted. Task 5 and Task 6 will continue editing the same surfaces; commit them together once the typecheck passes end-to-end. So skip the commit here.

---

## Task 5: Refactor `/api/budget-state` route

**Files:**
- Modify: `src/app/api/budget-state/route.ts`

- [ ] **Step 1: Replace the route body**

```typescript
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { parseBudgetStateBody } from "@/lib/budget/parse-budget-state";
import { fetchBudgetStateFromSupabase, replaceBudgetStateInSupabase } from "@/lib/budget/supabase-persistence";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

async function resolveBudgetUserId(): Promise<string | null> {
  const [hdrs, cks] = await Promise.all([headers(), cookies()]);
  const u = await getCurrentUser(hdrs, cks);
  return u?.userId ?? null;
}

export async function GET() {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  const userId = await resolveBudgetUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const state = await fetchBudgetStateFromSupabase(userId);
    return NextResponse.json({ state });
  } catch (err) {
    console.error("[Nudge] GET /api/budget-state failed", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  const userId = await resolveBudgetUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const state = parseBudgetStateBody(body);
  if (!state) {
    return NextResponse.json({ error: "Invalid budget payload" }, { status: 400 });
  }
  try {
    await replaceBudgetStateInSupabase(userId, state);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Nudge] PUT /api/budget-state failed", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
```

The `experienceId` query param is gone. Callers that still send it just have it ignored — that's fine while the client is being updated.

- [ ] **Step 2: Hold the commit** until Task 6.

---

## Task 6: Refactor `/experiences/[experienceId]` page + budget context

**Files:**
- Modify: `src/app/experiences/[experienceId]/page.tsx`
- Modify: `src/context/nudge-budget-context.tsx`

- [ ] **Step 1: Update the experience page**

In `src/app/experiences/[experienceId]/page.tsx`, replace the body of the `ExperiencePage` function so that the budget loader takes only `userId`. Concretely:
- Replace the existing `await fetchBudgetStateFromSupabase(experienceId, userId)` call with `await fetchBudgetStateFromSupabase(userId)`.
- Leave everything else (verifyUserToken, checkAccess, dev-preview fallback, providers) unchanged.

The diff is just the one call site:
```typescript
// Before:
//   remoteBudget = { snapshot: await fetchBudgetStateFromSupabase(experienceId, userId) };
// After:
    remoteBudget = { snapshot: await fetchBudgetStateFromSupabase(userId) };
```

- [ ] **Step 2: Update the budget context PUT URL**

In `src/context/nudge-budget-context.tsx`, change the debounced PUT effect (currently lines ~65–86) to drop the `experienceId` query param:

```typescript
  useEffect(() => {
    if (!hydrated) return;
    if (skipNextRemotePut.current) {
      skipNextRemotePut.current = false;
      return;
    }
    const t = setTimeout(() => {
      void fetch(
        `/api/budget-state`,
        nudgeBudgetFetchInit(props.whopUserToken, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(state),
        }),
      ).then((res) => {
        if (!res.ok) console.error("[Nudge] budget sync failed", res.status);
      });
    }, 650);
    return () => clearTimeout(t);
  }, [hydrated, props.whopUserToken, state]);
```

Keep the `experienceId` prop on `NudgeBudgetProvider` — `CurrencyPreferenceProvider` still uses it for its localStorage scoping, and the experience page still passes it through. We just removed the URL param.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Lint**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 5: Manual smoke**

```bash
npm run dev
```
Open `http://localhost:3001/experiences/dev`. Confirm: app renders, you can add a category and a transaction, and after a few seconds the network tab shows `PUT /api/budget-state` returning 200. Refresh the page — your changes persist. Ctrl-C to stop.

- [ ] **Step 6: Commit Tasks 2, 4, 5, 6 together**

```bash
git add src/lib/budget/supabase-persistence.ts src/lib/auth/current-user.ts src/app/api/budget-state/route.ts src/app/experiences/[experienceId]/page.tsx src/context/nudge-budget-context.tsx
git commit -m "refactor: drop experienceId from workbook scope; introduce getCurrentUser"
```

---

## Task 7: Look up Whop OAuth endpoints (research task, no code)

**Files:** none.

Whop's SDK does not ship OAuth client helpers, so we hit Whop's OAuth endpoints directly. Confirm the exact URLs before writing code.

- [ ] **Step 1: Fetch the official OAuth doc**

Use the `WebFetch` tool with:
- URL: `https://dev.whop.com/sdk/api/oauth/authorize`
- Prompt: "Extract: (1) the authorize endpoint URL, (2) the token-exchange endpoint URL, (3) required query/body parameters for each, (4) available scopes, (5) how to retrieve the user id from the resulting token."

If that URL 404s, also try:
- `https://docs.whop.com/oauth` and `https://dev.whop.com/oauth`.

- [ ] **Step 2: Record findings**

Add a short comment block at the top of `src/lib/auth/whop-oauth.ts` (which Task 8 will create) with: the authorize URL, the token URL, scopes used, and the link to the official doc. This file is the single source of truth in-repo.

- [ ] **Step 3: No commit** — research only.

---

## Task 8: Whop OAuth client helpers

**Files:**
- Create: `src/lib/auth/whop-oauth.ts`

- [ ] **Step 1: Write the helpers**

```typescript
/**
 * Whop OAuth client. Endpoints and scopes were verified against the official
 * Whop OAuth documentation — see Task 7 of the standalone-app plan.
 *
 * If Whop changes its OAuth shape, update the constants below.
 */

const WHOP_AUTHORIZE_URL = "https://whop.com/oauth"; // verify in Task 7
const WHOP_TOKEN_URL = "https://api.whop.com/api/v5/oauth/token"; // verify in Task 7
const DEFAULT_SCOPES = ["read_user"]; // verify in Task 7

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`${name} must be set`);
  return v.trim();
}

export function buildWhopAuthorizeUrl(opts: { state: string; redirectUri: string; scopes?: string[] }): string {
  const params = new URLSearchParams({
    client_id: requireEnv("NEXT_PUBLIC_WHOP_APP_ID"),
    response_type: "code",
    redirect_uri: opts.redirectUri,
    state: opts.state,
    scope: (opts.scopes ?? DEFAULT_SCOPES).join(" "),
  });
  return `${WHOP_AUTHORIZE_URL}?${params.toString()}`;
}

export type WhopTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
};

export async function exchangeWhopOAuthCode(opts: { code: string; redirectUri: string }): Promise<WhopTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: requireEnv("NEXT_PUBLIC_WHOP_APP_ID"),
    client_secret: requireEnv("WHOP_APP_CLIENT_SECRET"),
  });
  const res = await fetch(WHOP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Whop token exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as WhopTokenResponse;
}

/**
 * Fetch the authenticated user's id using their OAuth access token.
 * Whop's /v5/me endpoint returns the user profile.
 */
export async function fetchWhopUserId(accessToken: string): Promise<string> {
  const res = await fetch("https://api.whop.com/api/v5/me", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Whop /me failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { id?: string; user?: { id?: string } };
  const id = json.id ?? json.user?.id;
  if (!id || typeof id !== "string") throw new Error("Whop /me did not return a user id");
  return id;
}

export function getWhopOAuthRedirectUri(): string {
  return requireEnv("WHOP_OAUTH_REDIRECT_URI");
}
```

(`/v5/me` is the conventional Whop endpoint; Task 7 should have confirmed it. If Whop's doc points to a different endpoint or response shape, adjust `fetchWhopUserId` accordingly before moving on.)

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/whop-oauth.ts
git commit -m "feat(auth): add Whop OAuth client helpers"
```

---

## Task 9: Standalone access gate

**Files:**
- Create: `src/lib/auth/standalone-gate.ts`

- [ ] **Step 1: Write the gate**

```typescript
import { whopsdk } from "@/lib/whop-sdk";

/**
 * Standalone access requires the user to be an active member of at least one
 * Whop experience that has Nudge installed. We use whopsdk.experiences.list
 * with the user_id filter to enumerate experiences this user can access for
 * this app (the SDK is scoped by NEXT_PUBLIC_WHOP_APP_ID via the client init).
 *
 * If the SDK surface differs, this function is the only thing to update.
 */
export async function userHasAnyNudgeMembership(userId: string): Promise<boolean> {
  try {
    // The SDK paginates; checking the first page is sufficient — we just need
    // to know whether *any* experience exists.
    const page = await whopsdk.experiences.list({ user_id: userId });
    const items = (page as unknown as { data?: unknown[] }).data;
    return Array.isArray(items) && items.length > 0;
  } catch (err) {
    console.error("[Nudge] standalone gate check failed", err);
    return false;
  }
}
```

**Note for the implementer:** open `node_modules/@whop/sdk/resources/experiences.d.ts` and confirm the `list` parameter name. If the SDK uses a different filter (e.g. `userId` camelCase, or requires the call shape `whopsdk.users.<id>.experiences.list()`), adjust the call and the comment. The key requirement: a list of experiences this user has access to *within this app*. The SDK is already initialized with `appID`, so calls are automatically app-scoped.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/standalone-gate.ts
git commit -m "feat(auth): standalone access gate (any Nudge membership)"
```

---

## Task 10: `/api/auth/whop/start` route

**Files:**
- Create: `src/app/api/auth/whop/start/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { buildWhopAuthorizeUrl, getWhopOAuthRedirectUri } from "@/lib/auth/whop-oauth";
import { NUDGE_OAUTH_STATE_COOKIE, encodeOAuthState } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const SAFE_NEXT_RE = /^\/[A-Za-z0-9/_\-?=&%.]*$/;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawNext = url.searchParams.get("next") ?? "/app";
  const next = SAFE_NEXT_RE.test(rawNext) ? rawNext : "/app";

  const state = randomBytes(24).toString("hex");
  const cookieValue = encodeOAuthState({ state, next });
  const redirectUri = getWhopOAuthRedirectUri();
  const authorizeUrl = buildWhopAuthorizeUrl({ state, redirectUri });

  const res = NextResponse.redirect(authorizeUrl, { status: 302 });
  res.cookies.set(NUDGE_OAUTH_STATE_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return res;
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/whop/start/route.ts
git commit -m "feat(auth): /api/auth/whop/start OAuth kickoff"
```

---

## Task 11: `/api/auth/whop/callback` route

**Files:**
- Create: `src/app/api/auth/whop/callback/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server";
import { exchangeWhopOAuthCode, fetchWhopUserId, getWhopOAuthRedirectUri } from "@/lib/auth/whop-oauth";
import { userHasAnyNudgeMembership } from "@/lib/auth/standalone-gate";
import {
  NUDGE_OAUTH_STATE_COOKIE,
  NUDGE_SESSION_COOKIE,
  decodeOAuthState,
  encodeNudgeSession,
} from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function errorPage(message: string, status = 400): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Sign-in error</title></head><body style="font-family:system-ui;max-width:520px;margin:5rem auto;padding:0 1rem;text-align:center"><h1>Couldn't sign you in</h1><p>${message}</p><p><a href="/login">Try again</a></p></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");

  const stateCookie = req.headers.get("cookie")?.match(new RegExp(`${NUDGE_OAUTH_STATE_COOKIE}=([^;]+)`))?.[1];
  if (!code || !stateParam || !stateCookie) return errorPage("Missing OAuth parameters.");

  const claims = decodeOAuthState(stateCookie);
  if (!claims || claims.state !== stateParam) return errorPage("OAuth state mismatch. Please try again.");

  let userId: string;
  try {
    const token = await exchangeWhopOAuthCode({ code, redirectUri: getWhopOAuthRedirectUri() });
    userId = await fetchWhopUserId(token.access_token);
  } catch (err) {
    console.error("[Nudge] OAuth token exchange failed", err);
    return errorPage("We couldn't reach Whop to verify your sign-in. Try again in a moment.", 502);
  }

  const allowed = await userHasAnyNudgeMembership(userId);
  if (!allowed) {
    return errorPage(
      "You need an active Nudge membership in a Whop community to use the standalone app. Open Nudge from your community once, then try signing in here.",
      403,
    );
  }

  // Upsert nudge_profiles so subsequent budget operations don't 23503.
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("nudge_profiles").upsert({ whop_user_id: userId }, { onConflict: "whop_user_id" });
    if (error) throw error;
  } catch (err) {
    console.error("[Nudge] profile upsert during OAuth callback failed", err);
    return errorPage("We signed you in but couldn't initialize your account. Try again.", 500);
  }

  const sessionToken = encodeNudgeSession({ sub: userId, gate_checked_at: Math.floor(Date.now() / 1000) });
  const res = NextResponse.redirect(new URL(claims.next, url.origin), { status: 302 });
  res.cookies.set(NUDGE_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 3600,
  });
  res.cookies.set(NUDGE_OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/whop/callback/route.ts
git commit -m "feat(auth): /api/auth/whop/callback session issue + gate check"
```

---

## Task 12: `/api/auth/logout` route

**Files:**
- Create: `src/app/api/auth/logout/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server";
import { NUDGE_SESSION_COOKIE } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const res = NextResponse.redirect(new URL("/", url.origin), { status: 303 });
  res.cookies.set(NUDGE_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/logout/route.ts
git commit -m "feat(auth): /api/auth/logout"
```

---

## Task 13: `/login` page

**Files:**
- Create: `src/app/login/page.tsx`

- [ ] **Step 1: Write the page**

```typescript
import Image from "next/image";
import { Heading, Text } from "frosted-ui";
import nudgeLogo from "@/app/assets/Nuget_logo_nobackfournd.png";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const startHref = `/api/auth/whop/start${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 sm:px-6 sm:py-20">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center">
          <Image
            src={nudgeLogo}
            alt=""
            width={96}
            height={96}
            className="h-full w-full max-h-24 object-contain object-center"
            priority
          />
        </div>
        <Heading size="7" className="mb-3">Sign in to Nudge</Heading>
        <Text size="3" color="gray" className="mb-8 leading-relaxed">
          Use your Whop account. You need an active Nudge membership in a Whop community.
        </Text>
        <a
          href={startHref}
          className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-5 py-3 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
        >
          Continue with Whop
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

```bash
npx tsc --noEmit && npm run lint
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat(auth): /login page with Continue with Whop button"
```

---

## Task 14: `/app` standalone page

**Files:**
- Create: `src/app/app/page.tsx`

- [ ] **Step 1: Write the page**

```typescript
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Heading, Text } from "frosted-ui";
import { NudgeApp } from "@/components/nudge/nudge-app";
import { CurrencyPreferenceProvider } from "@/context/currency-context";
import { NudgeBudgetProvider } from "@/context/nudge-budget-context";
import type { BudgetState } from "@/lib/budget/types";
import { fetchBudgetStateFromSupabase } from "@/lib/budget/supabase-persistence";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth/current-user";
import { userHasAnyNudgeMembership } from "@/lib/auth/standalone-gate";

export const dynamic = "force-dynamic";

const STANDALONE_EXPERIENCE_ID = "standalone";
const GATE_REFRESH_SECONDS = 15 * 60;

export default async function StandaloneAppPage() {
  if (!isSupabasePersistenceEnabled()) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center sm:px-6">
        <Heading size="6">Database not configured</Heading>
        <Text size="3" color="gray" className="max-w-md">
          Nudge stores your budget on Supabase. Set the Supabase env vars and redeploy.
        </Text>
      </div>
    );
  }

  const [hdrs, cks] = await Promise.all([headers(), cookies()]);
  const user = await getCurrentUser(hdrs, cks);

  if (!user || user.source === "whop-iframe") {
    // whop-iframe shouldn't hit /app, but if it does, send them to their experience flow.
    redirect("/login?next=/app");
  }

  // Re-check the standalone gate if it's stale. Force-logout on failure.
  if (user.source === "standalone-session") {
    const stale = Math.floor(Date.now() / 1000) - user.gateCheckedAt > GATE_REFRESH_SECONDS;
    if (stale) {
      const allowed = await userHasAnyNudgeMembership(user.userId);
      if (!allowed) {
        // We can't clear cookies from an RSC; rely on /login + the next OAuth round-trip
        // to overwrite the session. Surface the gate failure by sending them to /login.
        redirect("/login?next=/app&reason=gate");
      }
      // Refresh the cookie's gate_checked_at via Set-Cookie on this RSC.
      // Note: we can only set cookies in route handlers or Server Actions, not RSCs.
      // Approach: skip refresh here; rely on cookie's natural rotation when the user signs in again.
      // The 15-minute check still re-runs the Whop API on each /app load, so the gate stays current
      // even though we don't rewrite the cookie. This keeps RSCs cookie-write-free.
    }
  }

  let remoteBudget: { snapshot: BudgetState | null };
  try {
    remoteBudget = { snapshot: await fetchBudgetStateFromSupabase(user.userId) };
  } catch (err) {
    console.error("[Nudge] Failed to load budget from Supabase (standalone)", err);
    remoteBudget = { snapshot: null };
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <NudgeBudgetProvider
        experienceId={STANDALONE_EXPERIENCE_ID}
        userId={user.userId}
        whopUserToken={null}
        remote={remoteBudget}
      >
        <CurrencyPreferenceProvider experienceId={STANDALONE_EXPERIENCE_ID} userId={user.userId}>
          <NudgeApp devMode={user.source === "dev-preview"} />
        </CurrencyPreferenceProvider>
      </NudgeBudgetProvider>
    </div>
  );
}
```

Note: RSCs can read cookies but cannot set them. The plan therefore relies on each `/app` request re-querying Whop when the cookie's `gate_checked_at` is stale, rather than rewriting the cookie. This is acceptable — the bound is on staleness of *eviction*, not the cookie value. If you later need to refresh `gate_checked_at` in the cookie, do it in a Server Action triggered by a small client-side `useEffect`.

- [ ] **Step 2: Typecheck and lint**

```bash
npx tsc --noEmit && npm run lint
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/app/page.tsx
git commit -m "feat(app): /app standalone entrypoint"
```

---

## Task 15: Add a Sign-out button (standalone only)

**Files:**
- Modify: `src/components/nudge/nudge-app.tsx` (find the top bar / app chrome)
- Modify: `src/app/app/page.tsx` (pass a `showSignOut` prop)

- [ ] **Step 1: Locate the app chrome**

```bash
grep -n "NudgeApp\|devMode" "C:/Users/edward/Documents/01 - Personal/06 - WHOP/01 - Operance/apps/budget-app/src/components/nudge/nudge-app.tsx" | head -20
```
Identify the top bar / header element.

- [ ] **Step 2: Add a `showSignOut?: boolean` prop**

Threading: in `NudgeApp`'s props, add `showSignOut?: boolean`. In the header, when `showSignOut` is true, render:

```tsx
<form action="/api/auth/logout" method="post">
  <button type="submit" className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">
    Sign out
  </button>
</form>
```

Place it next to existing top-right controls (currency picker, etc.). If the header is in a sub-component, thread the prop through.

- [ ] **Step 3: Pass `showSignOut={true}` from `/app`**

In `src/app/app/page.tsx`, update the `<NudgeApp ... />` to:
```tsx
<NudgeApp devMode={user.source === "dev-preview"} showSignOut />
```
Leave the iframe entry (`src/app/experiences/[experienceId]/page.tsx`) untouched — Whop iframes shouldn't show a sign-out.

- [ ] **Step 4: Typecheck and lint**

```bash
npx tsc --noEmit && npm run lint
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/nudge/nudge-app.tsx src/app/app/page.tsx
git commit -m "feat(app): sign-out button on standalone surface"
```

---

## Task 16: Env-var wiring

**Files:**
- Modify: `.env.example` (if missing or out of date)
- Modify: `CODEBASE.md` env table
- Modify: `next.config.ts` only if you need new public env exposure (you don't — `NEXT_PUBLIC_WHOP_APP_ID` is already there)

- [ ] **Step 1: Update `.env.example`**

Open `.env.example` and append:
```
# Standalone OAuth (added 2026-05-26)
WHOP_APP_CLIENT_SECRET=
WHOP_OAUTH_REDIRECT_URI=http://localhost:3001/api/auth/whop/callback
NUDGE_SESSION_SECRET=
NUDGE_APP_BASE_URL=http://localhost:3001
```
If `.env.example` doesn't exist, create it with just those four lines plus a comment.

- [ ] **Step 2: Update the env table in `CODEBASE.md`**

Add four rows to the Environment variables table:

| `WHOP_APP_CLIENT_SECRET` | Whop OAuth client secret (server only) for standalone sign-in |
| `WHOP_OAUTH_REDIRECT_URI` | Full URL of `/api/auth/whop/callback`; must be registered in Whop app settings |
| `NUDGE_SESSION_SECRET` | HS256 key for session and OAuth-state cookies (32+ chars) |
| `NUDGE_APP_BASE_URL` | Public origin used to build absolute redirect URIs |

- [ ] **Step 3: Generate a local secret for `.env.local`**

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Copy the output, paste into `.env.local` as `NUDGE_SESSION_SECRET=...`. Do NOT commit `.env.local`.

- [ ] **Step 4: Register the local redirect URI in your Whop app dashboard**

Open the Whop developer dashboard for this app, add `http://localhost:3001/api/auth/whop/callback` as an allowed OAuth redirect URI, and copy the **client secret** into `.env.local` as `WHOP_APP_CLIENT_SECRET=...`.

- [ ] **Step 5: Commit doc + example updates**

```bash
git add .env.example CODEBASE.md
git commit -m "docs: env vars for standalone OAuth flow"
```

---

## Task 17: End-to-end smoke test

**Files:** none.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify Whop iframe path still works**

Open `http://localhost:3001/experiences/dev` (uses dev-preview user). Confirm the app renders and you can add a transaction. Refresh — it persists. ✅

- [ ] **Step 3: Verify `/app` redirects to `/login` when unauthenticated**

Open `http://localhost:3001/app` in a private window (no cookies). Expected: redirect to `/login?next=%2Fapp`. ✅

- [ ] **Step 4: Verify the OAuth round-trip**

Click "Continue with Whop" on `/login`. You should be redirected to Whop, approve, and land back on `/app` with the budget app rendered.

Possible failure modes and what to check:
- **`Whop token exchange failed: 401`** → `WHOP_APP_CLIENT_SECRET` is wrong or the redirect URI isn't registered.
- **`OAuth state mismatch`** → cookies blocked, or you opened the callback URL directly. Restart the flow from `/login`.
- **"You need an active Nudge membership"** → the gate's `whopsdk.experiences.list` returned empty for this user. Either (a) install Nudge in a community this user has access to, or (b) temporarily set `NUDGE_STRICT_WHOP=0` and use the dev-preview flow.

- [ ] **Step 5: Verify the same workbook appears in both surfaces**

While signed in on `/app`, add a transaction with note "Cross-surface check". Open `/experiences/dev` (dev-preview user) — only the same data appears if the dev-preview user is the same `whop_user_id` you signed in as. If they differ, this is expected; just confirm the data is whatever the active user owns.

Better cross-surface check: sign in standalone as user A → add transaction. Open the Whop dashboard, view the app as user A in any experience → same transaction visible.

- [ ] **Step 6: Verify sign-out**

Click "Sign out" on `/app`. Expected: redirect to `/`. Re-visit `/app` → redirect back to `/login`.

- [ ] **Step 7: No commit** — smoke test only.

---

## Self-review checklist for the implementer

Before opening a PR:

- `npx tsc --noEmit` passes.
- `npm run lint` passes.
- All 6 smoke-test substeps in Task 17 pass.
- `.env.example` includes the four new variables.
- The spec at `docs/superpowers/specs/2026-05-26-standalone-app-mode-design.md` matches the implemented behavior; if reality diverged, update the spec in the same PR.
- No `experience_id` references remain in budget persistence code or the budget-state route (`grep -rn "experience_id\b" src/lib/budget src/app/api/budget-state` should be empty).
