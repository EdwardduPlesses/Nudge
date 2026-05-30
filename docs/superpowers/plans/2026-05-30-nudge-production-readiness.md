# Nudge Production-Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up Playwright E2E testing against the live DB as an isolated test user, fix the anchor-day period overshoot bug, and run a broad adversarial audit (correctness → UX → perf → a11y) fixing what's found.

**Architecture:** Local `next dev` in development mode auto-authenticates the dev-preview user (`dev_local_user`) whose workbook is isolated. Playwright drives that. A guarded service-role reset keeps test data contained. The anchor-day fix extracts a pure, bounded period planner that never overshoots past today's period. The audit fans out parallel read-only agents, adversarially verifies findings, and fixes each TDD-style.

**Tech Stack:** Next.js 16, React 19, Supabase, `@playwright/test`, vitest, date-fns, Whop SDK.

**Note (AGENTS.md):** This is a modified Next.js 16. Consult `node_modules/next/dist/docs/` before writing any Next-specific code.

---

## File Structure

- `playwright.config.ts` — Playwright config; webServer boots `dev:next` on :3000.
- `tests/e2e/helpers/db.ts` — guarded service-role DB reset/seed, scoped to the test user only.
- `tests/e2e/helpers/seed.ts` — deterministic workbook seed for stable assertions.
- `tests/e2e/smoke.spec.ts` — app loads, tab nav.
- `tests/e2e/anchor-day.spec.ts` — anchor-day regression (RED→GREEN).
- `tests/e2e/core-flows.spec.ts` — transaction/category/goal/recurring/currency/sharing flows.
- `src/lib/budget/period-math.ts` — add pure `planPeriodsToCreate`.
- `src/lib/budget/period-math.test.ts` — planner unit tests.
- `src/lib/budget/period-repo.ts` — wire `ensureCurrentPeriod` to the planner.
- `docs/superpowers/reports/2026-05-30-nudge-production-readiness-report.md` — final report.

---

## Task 1: Playwright harness + safety guard

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/helpers/db.ts`
- Modify: `package.json` (add `e2e` scripts)
- Modify: `.gitignore` (ignore `test-results/`, `playwright-report/`, `.playwright/`)

- [ ] **Step 1: Playwright config.** Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const BASE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // shared test-user workbook → run serially to avoid cross-test races
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: BASE, trace: "on-first-retry", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run dev:next",
    url: BASE,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { NODE_ENV: "development" }, // dev-preview auth → dev_local_user; NUDGE_STRICT_WHOP must be unset
  },
});
```

- [ ] **Step 2: Guarded DB reset helper.** Create `tests/e2e/helpers/db.ts`. The guard hard-refuses to touch any user other than the test id:

```ts
import { createClient } from "@supabase/supabase-js";

export const TEST_USER_ID = "dev_local_user";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing for E2E DB helper");
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Delete ALL data for the test user's workbook(s). Refuses any other user id. */
export async function resetTestUser(userId: string = TEST_USER_ID): Promise<void> {
  if (userId !== TEST_USER_ID) {
    throw new Error(`resetTestUser refused: '${userId}' is not the known test user`);
  }
  const sb = admin();
  const { data: wbs } = await sb.from("nudge_workbooks").select("id").eq("whop_user_id", userId);
  const ids = (wbs ?? []).map((w) => w.id as string);
  for (const id of ids) {
    // child rows first (FKs); period-scoped tables cascade via period delete where defined
    await sb.from("nudge_transactions").delete().eq("workbook_id", id);
    await sb.from("nudge_periods").delete().eq("workbook_id", id);
    await sb.from("nudge_categories").delete().eq("workbook_id", id);
    await sb.from("nudge_goals").delete().eq("workbook_id", id);
    await sb.from("nudge_debts").delete().eq("workbook_id", id);
    await sb.from("nudge_recurring").delete().eq("workbook_id", id);
    await sb.from("nudge_workbook_members").delete().eq("workbook_id", id);
    await sb.from("nudge_workbooks").delete().eq("id", id);
  }
  await sb.from("nudge_profiles").delete().eq("whop_user_id", userId);
}
```

> Exact table/column names to be confirmed against `supabase/migrations/` during execution; adjust the delete set to the real schema (and FK order) before relying on it.

- [ ] **Step 3: Scripts + gitignore.** Add to `package.json` scripts: `"e2e": "playwright test"`, `"e2e:ui": "playwright test --ui"`. Add `test-results/`, `playwright-report/`, `.playwright/` to `.gitignore`.

- [ ] **Step 4: Verify Playwright runs.** Run: `npx playwright test --list`. Expected: lists specs (after Task 2 adds them) with desktop + mobile projects. For now expect "no tests found" — acceptable.

- [ ] **Step 5: Commit.**

```bash
git add playwright.config.ts tests/e2e/helpers/db.ts package.json .gitignore
git commit -m "test(e2e): add Playwright harness + guarded test-user DB reset"
```

---

## Task 2: Smoke + core-flow E2E

**Files:**
- Create: `tests/e2e/helpers/seed.ts`
- Create: `tests/e2e/smoke.spec.ts`
- Create: `tests/e2e/core-flows.spec.ts`

- [ ] **Step 1:** Write `seed.ts` exporting `seedBasic(userId)` that resets then drives the app/API to a known state (or inserts known rows via service role). Confirm against schema during execution.
- [ ] **Step 2:** Write `smoke.spec.ts`: visit `/app`, assert dashboard heading + the tab nav render; navigate each tab; assert no error boundary.
- [ ] **Step 3:** Write `core-flows.spec.ts`: add a transaction and assert it appears + totals update; add/rename a category and set a budget limit; add a goal; add a recurring item; switch display currency; open the sharing dialog. Assert persistence by reloading.
- [ ] **Step 4:** Run: `npm run e2e`. Triage failures — these establish the baseline. Real product bugs found here feed Task 5.
- [ ] **Step 5:** Commit: `git commit -m "test(e2e): smoke + core-flow coverage"`.

---

## Task 3: Pure period planner (fixes the overshoot) — TDD

**Files:**
- Modify: `src/lib/budget/period-math.ts`
- Modify: `src/lib/budget/period-math.test.ts`

- [ ] **Step 1: Write the failing tests** in `period-math.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { planPeriodsToCreate } from "./period-math";

describe("planPeriodsToCreate", () => {
  it("creates just today's period when none exist", () => {
    expect(planPeriodsToCreate([], 25, "2026-05-30")).toEqual(["2026-05-25"]);
  });

  it("returns [] when today's period already exists", () => {
    expect(planPeriodsToCreate(["2026-05-25"], 25, "2026-05-30")).toEqual([]);
  });

  it("fills the gap forward when the same-anchor grid is behind (no overshoot)", () => {
    expect(planPeriodsToCreate(["2026-02-25"], 25, "2026-05-30")).toEqual([
      "2026-03-25",
      "2026-04-25",
      "2026-05-25",
    ]);
  });

  it("does NOT overshoot when the anchor day changes (the 2097 bug)", () => {
    // Old grid started on the 1st; user switches anchor to 25; today is 2026-05-30.
    expect(planPeriodsToCreate(["2026-04-01", "2026-05-01"], 25, "2026-05-30")).toEqual([
      "2026-05-25",
    ]);
  });

  it("creates only today's period when the latest existing start is after target", () => {
    // Anchor moved earlier: existing periods sit after the new target start.
    expect(planPeriodsToCreate(["2026-04-25", "2026-05-25"], 1, "2026-05-30")).toEqual([
      "2026-05-01",
    ]);
  });

  it("is bounded — never returns more than the cap + target", () => {
    const plan = planPeriodsToCreate(["1990-01-01"], 1, "2026-05-30");
    expect(plan.length).toBeLessThanOrEqual(241);
    expect(plan[plan.length - 1]).toBe("2026-05-01");
  });
});
```

- [ ] **Step 2: Run to verify failure.** Run: `npx vitest run src/lib/budget/period-math.test.ts`. Expected: FAIL — `planPeriodsToCreate is not a function`.

- [ ] **Step 3: Implement** in `period-math.ts`:

```ts
/**
 * Ordered list of period start dates to create so that the period containing
 * `todayIso` exists, given an anchor day. Fills the gap forward from the most
 * recent existing period that starts before today's period, but NEVER returns a
 * start after today's period (no overshoot when the anchor day changes). The
 * target (today's period start) is always the last element when non-empty.
 */
export function planPeriodsToCreate(
  existingStarts: string[],
  anchorDay: number,
  todayIso: string,
): string[] {
  const CAP = 240;
  const anchor = clampAnchorDay(anchorDay);
  const target = periodRangeFor(todayIso, anchor).start;
  const existing = new Set(existingStarts);
  if (existing.has(target)) return [];

  const before = existingStarts.filter((s) => s < target).sort();
  const prior = before.length ? before[before.length - 1] : null;
  if (prior === null) return [target];

  const out: string[] = [];
  let cursor = nextPeriodStart(prior, anchor);
  let guard = 0;
  while (cursor < target && guard < CAP) {
    out.push(cursor);
    cursor = nextPeriodStart(cursor, anchor);
    guard++;
  }
  out.push(target);
  return out;
}
```

- [ ] **Step 4: Run to verify pass.** Run: `npx vitest run src/lib/budget/period-math.test.ts`. Expected: PASS (all cases).

- [ ] **Step 5: Commit.** `git commit -m "fix(periods): pure bounded planPeriodsToCreate (no anchor-change overshoot)"`.

---

## Task 4: Wire ensureCurrentPeriod to the planner + Playwright regression

**Files:**
- Modify: `src/lib/budget/period-repo.ts:39-71`
- Create: `tests/e2e/anchor-day.spec.ts`

- [ ] **Step 1: Refactor `ensureCurrentPeriod`** to use the planner. Compute the snapshot source as the most recent existing period that starts before the first created start:

```ts
export async function ensureCurrentPeriod(
  workbookId: string,
  anchorDay: number,
  todayIso: string,
): Promise<PeriodRow> {
  const anchor = clampAnchorDay(anchorDay);
  const target = periodRangeFor(todayIso, anchor);
  const periods = await listPeriods(workbookId);

  const found = periods.find((p) => p.startDate === target.start);
  if (found) return found;

  const toCreate = planPeriodsToCreate(periods.map((p) => p.startDate), anchor, todayIso);
  // Snapshot source: most recent existing period starting before the first new period.
  const firstNew = toCreate[0] ?? target.start;
  const priorRows = periods.filter((p) => p.startDate < firstNew).sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  let snapshotFrom: PeriodRow | null = priorRows[0] ?? null;

  let last: PeriodRow | null = null;
  for (const start of toCreate) {
    const range = periodRangeFor(start, anchor);
    const created = await insertPeriod(workbookId, range.start, range.end);
    if (snapshotFrom) await copySnapshot(snapshotFrom.id, created.id);
    await materializeRecurring(workbookId, { id: created.id, startDate: created.startDate, endDate: created.endDate });
    last = created;
    snapshotFrom = created;
  }
  if (!last) {
    // Defensive: target should always be the last planned start.
    last = await insertPeriod(workbookId, target.start, target.end);
    await materializeRecurring(workbookId, { id: last.id, startDate: last.startDate, endDate: last.endDate });
  }
  return last;
}
```

Remove the now-unused `nextPeriodStart` import if it's no longer referenced here (it's still used by the planner in period-math). Keep `import { ..., planPeriodsToCreate }`.

- [ ] **Step 2: Run unit tests.** Run: `npx vitest run`. Expected: PASS (period-math + existing suites).

- [ ] **Step 3: Write the Playwright regression** `anchor-day.spec.ts`: reset test user; visit `/app`; note current period label/year; open Settings; change "Budget cycle" to a different day; wait for reload; assert the current period label is the current month/year (NOT a far-future year) and the period selector shows a sane current period. Assert by reloading too.

- [ ] **Step 4: Run E2E.** Run: `npm run e2e -- anchor-day`. Expected: PASS. Re-run twice to confirm no compounding drift across reloads.

- [ ] **Step 5: Commit.** `git commit -m "fix(periods): ensureCurrentPeriod uses bounded planner; e2e regression"`.

---

## Task 5: Workflow-driven adversarial audit + fixes

This phase is discovery-driven. Run it as a workflow (find → verify → fix), surfacing the verified findings to the user before the larger fixes.

- [ ] **Step 1: Find.** Fan out read-only audit agents, one per dimension: date/period math; money & FX rounding; auth/sharing/authorization (incl. composite-PK per-item auth — see memory `composite-pk-footgun`); optimistic-sync & data integrity; API input validation; UX/empty/error states; mobile layout; accessibility; performance. Each returns structured findings `{title, file, severity, repro, why}`.
- [ ] **Step 2: Verify.** Independent skeptic agents adversarially refute each finding; keep only confirmed findings with a concrete repro. Dedup.
- [ ] **Step 3: Triage + report to user.** Sort by severity. Present the confirmed list; fix all P0/P1 (correctness/data integrity/security) this session, then work down UX → perf → a11y.
- [ ] **Step 4: Fix each (TDD).** For each confirmed bug: write a failing test (vitest for logic, Playwright for flow), implement minimal fix, run tests green, commit per fix.
- [ ] **Step 5: Regression.** Run full `npx vitest run` + `npm run e2e` after each batch.

---

## Task 6: Final verification + report

- [ ] **Step 1:** Run `npm run lint`, `npx vitest run`, `npm run e2e`, and `npm run build`. All must pass.
- [ ] **Step 2:** Write `docs/superpowers/reports/2026-05-30-nudge-production-readiness-report.md`: bugs found, bugs fixed (with commit refs), deferred items + rationale, test coverage added.
- [ ] **Step 3:** Commit the report. Summarize the branch diff for the user to review/merge.

---

## Self-Review

- **Spec coverage:** harness+safety (T1), baseline suite (T2), anchor fix TDD (T3–T4), adversarial audit (T5), verification+report (T6) — all spec sections mapped.
- **Placeholders:** schema-dependent table names in T1/T2 are flagged to confirm against migrations at execution (not silent TODOs). Audit findings are intentionally discovery-driven, not pre-enumerated.
- **Type consistency:** `planPeriodsToCreate(existingStarts, anchorDay, todayIso)` signature identical in T3 (def) and T4 (use); `TEST_USER_ID`/`resetTestUser` consistent across T1/T2/T4.
