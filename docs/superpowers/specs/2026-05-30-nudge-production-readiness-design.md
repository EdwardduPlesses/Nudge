# Nudge — Production-Readiness Design

**Date:** 2026-05-30
**Branch:** `prod-readiness`
**Goal:** Make the Nudge budget app production-ready: stand up Playwright E2E testing, fix the known anchor-day bug, and run a broad correctness → UX → perf → a11y audit, fixing what's found.

## Context

- **Stack:** Next.js 16 (modified — see `AGENTS.md`; consult `node_modules/next/dist/docs/` before writing Next-specific code), React 19, Supabase (single shared DB), Whop OAuth, frosted-ui, recharts, date-fns. vitest present; **no Playwright yet**.
- **Auth model** (`src/lib/auth/current-user.ts`): three sources in precedence order — (1) Whop iframe token, (2) `nudge_session` HS256 cookie, (3) **dev-preview fallback** (`NODE_ENV=development` && `NUDGE_STRICT_WHOP != "1"`) → fixed user `dev_local_user`, which bypasses the entitlement gate entirely.
- **Per-user workbooks** (`ensureActiveWorkbook`, `src/lib/budget/workbook-access.ts`): any user id gets its own isolated workbook + owner membership + initial period on first use. So the test user's data is naturally isolated from real users.
- `.env.local` holds all secrets (Supabase URL + service-role key + `NUDGE_SESSION_SECRET`), so a local dev server can run against the live DB immediately.

## Decisions (user-confirmed)

1. **Test target:** Local `next dev` server against the live Supabase DB, authenticated as an isolated test user. Writes only to that user's workbook. Cannot break the deployed live site.
2. **Scope:** Everything — correctness & data integrity first, then UX polish, then perf & a11y. P0 correctness fixed completely; lower tiers worked down and anything unfinished reported, not left half-done.
3. **Git:** Work branch `prod-readiness`, one commit per fix with passing tests. Nothing pushed unless the user asks.

## The headline bug — anchor-day period overshoot

**Symptom:** changing the budget anchor day makes the "current period" jump ~70 years into the future (≈2097).

**Root cause** (`ensureCurrentPeriod`, `src/lib/budget/period-repo.ts:39`): the catch-up loop only rolls the period grid *forward* from `nextPeriodStart(latest)`. When the anchor day changes, the grid shifts so today's period start (`target.start`) aligns with no existing period row. If `nextPeriodStart(latest)` is already ≥ `target.start`, the loop never matches `target.start`, runs all 240 iterations creating ~20 years of future periods, and returns the last one as "current." Each subsequent `/api/periods` GET (every page load) re-overshoots from the new far-future latest period, compounding: 2046 → 2066 → 2086 → ~2097.

**Fix:** Extract the rollover decision into a pure, bounded planner `planPeriodsToCreate(existingStarts, anchor, todayIso)` that:
- always resolves the period containing today on the *current* anchor grid,
- never creates a period whose start is after today's period start (no overshoot),
- handles a grid shift when the anchor changes (target may not align with any existing start; latest may already be ahead of target),
- caps forward fill to a sane bound for snapshot continuity.

`ensureCurrentPeriod` consumes the planner. Unit-test the planner in vitest (including the overshoot/anchor-change cases); confirm green end-to-end via a Playwright regression that sets the anchor day and asserts the current period stays in the correct month/year.

## Architecture

### Test harness & safety
- Install `@playwright/test` + Chromium. `playwright.config.ts` with a `webServer` booting `dev:next` on :3000 in development mode (dev-preview auth → `dev_local_user`). Projects: desktop Chromium + a mobile viewport.
- **Isolation guard** (`tests/e2e/helpers/db.ts`): service-role reset of *only* the test user's workbook to a known seed before each spec. Hard-refuses any delete whose target `whop_user_id` is not the known test id (`dev_local_user`) — a bug in a test can never touch real data.
- Deterministic seed fixtures for stable assertions.

### Baseline regression suite
Smoke (load, tab nav); anchor-day reproduction (RED→GREEN); core flows: add/edit transaction, category + budget limit, goals, recurring, period navigation, currency switch, sharing invite.

### Workflow-driven adversarial audit
1. **Find** — parallel read-only audit agents by dimension: date/period math, money & FX math, auth/sharing/authorization, optimistic-sync & data integrity, API input validation, UX/empty/error states, mobile layout, accessibility, performance. Structured findings.
2. **Verify** — independent skeptic agents adversarially refute each finding; keep only confirmed findings with a concrete repro.
3. **Fix** — each confirmed bug fixed failing-test-first (vitest for logic, Playwright for flows), committed per fix. Verified findings surfaced to the user before the larger fixes.

## Testing strategy

- **vitest** for pure logic (period planner, money/FX math, selectors, sharing, debt).
- **Playwright** for flows and regressions, driven against the local dev server as the isolated test user.
- Every fix lands with a test that fails before and passes after.

## Deliverables

- `prod-readiness` branch, one commit per fix, full vitest + Playwright suites green.
- Committed Playwright harness + suites.
- A written report: bugs found, bugs fixed, and any deferred items with rationale.

## Out of scope / risks

- Not changing the deployment pipeline or Whop app configuration.
- The full "everything" audit may surface more than fits one session; P0 correctness is completed, lower tiers worked down and remaining items reported.
- Test data accrues in the live DB under the `dev_local_user` workbook only; the reset guard keeps it contained.
