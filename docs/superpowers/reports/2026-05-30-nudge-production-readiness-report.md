# Nudge — Production-Readiness Report

**Date:** 2026-05-30 · **Branch:** `prod-readiness` (14 commits, branched off `main`)

## Summary

Stood up Playwright E2E testing against the live Supabase DB (as an isolated dev-preview
test user), fixed the reported anchor-day bug, and ran a workflow-driven adversarial audit
(55 agents, 10 dimensions, find → verify) that surfaced **45 raw findings → 37 confirmed**
(6 refuted, 2 uncertain). Fixed **all P0 + all P1 + the security/data-integrity P2s + most
UX/a11y/perf P2s + several P3s**.

**Verification (all green):** 47 vitest unit tests · 13 Playwright E2E (desktop + mobile) ·
`next build` succeeds. Lint shows only 6 pre-existing `react-hooks/set-state-in-effect`
errors (not introduced here, do not block the build — see Deferred).

## Test infrastructure added

- `playwright.config.ts` — webServer boots `next dev` (dev-preview auth → `dev_local_user`); desktop + mobile projects.
- `tests/e2e/helpers/db.ts` — service-role reset/seed **hard-guarded** to the test user id only (a test bug can't touch real data).
- Suites: `smoke`, `anchor-day`, `core-flows`, `currency`, `period-integrity`, `ux`, `mobile.mobile`.
- Unit: `period-math` (planner), `period-aware`, `validation`.

## Bugs fixed

### P0 — data corruption
- **Currency-change double-conversion** (`242bffc`). Concurrent/retried currency changes each ran the multiply-all RPC → permanent ~rate² corruption of every stored amount. Fixed with an atomic compare-and-swap claim (multiply runs at most once) + client in-flight guard. (No prod DDL required.)

### P1 — incorrect results / data integrity
- **Anchor-day period overshoot** (`5d619d5`) — the reported bug. Rollover created ~240 future periods on an anchor change (current jumped ~20y, compounding per reload). Pure bounded `planPeriodsToCreate`; unit + E2E regression.
- **Calendar-month vs anchor-period mismatch** (`80fcd15`). Dashboard/insights/velocity/category-health/AI-prompt re-filtered period-scoped data by calendar month, understating every non-day-1 period's totals and breaking past-period views. Now period-aware throughout.
- **Velocity day counts** (`80fcd15`). Forecast/safe-to-spend/status used Gregorian-month day counts → false overspending. Now derived from the period range.
- **Stale FX conversion** (`242bffc`). Currency conversion silently used hardcoded fallback rates when the rate API was down. Now rejects with 503.
- **Transactions filed by "now", not their date** (`98cc50a`). Back/forward-dated entries landed in the wrong period. Now derived from the transaction date.
- **Client-only read-only guard** (`98cc50a`). Closed-period income/limits could be rewritten via direct API. Now enforced server-side (409).

### P2 — security / UX / a11y / perf
- Invite-accept now re-verifies revoked members (`26ea44a`); `debt_id` and transaction `date` validated; stale-tab writes to closed periods rejected (`98cc50a`).
- Destructive deletes (transaction/goal/debt/recurring) now require confirmation (`4518840`).
- Add/Edit transaction shows inline validation instead of silently no-opping (`4518840`); inputs got accessible names.
- Read-only past-period: FAB + period-scoped Add/Edit/Remove hidden when not editable (`d0e1251`).
- Mobile sync-error toast lifted above the bottom nav (`20b1eef`).
- Filter pills expose `aria-pressed`; charts get `role=img` + data summaries (`ea6145d`).
- Perf: `ensureMemberProfiles` N+1 parallelized (`20b1eef`); index migration for `nudge_transactions(period_id)` (`20b1eef`, apply via `db push`).

### P3
- Category spend recompute reduced from O(categories×transactions) to one pass (`80fcd15`).
- Recurring `day_of_period` validated server-side; user string fields length-capped (`26ea44a`).
- Weekly-bar chart no longer clipped on the smallest phones (`ea6145d`).

## Deferred / recommended follow-ups

- **DB migrations to apply** (`db push`): `nudge_transactions(period_id)` index. The currency-conversion RPC hardening was done at the route layer (no DDL needed); a DB-level guard would be defense-in-depth.
- **6 pre-existing ESLint `set-state-in-effect` errors** (add-transaction-dialog, goals-tab, theme-toggle). They do **not** block `next build` (Next 16 dropped build-time lint). Left to your established convention (inline disable per the prior commit) since you were already iterating on this.
- **Tab keyboard model (P2 a11y):** the nav tablists lack arrow-key/roving-tabindex and `aria-controls`/`aria-labelledby`. WCAG 2.1.1 is met (tabs are activatable buttons); the APG pattern is incomplete.
- **Low-contrast tokens (P2 a11y):** `--ink-muted` (~3.9–4.3:1) and `--ink-faint` used for some informational text (~2:1) fall under WCAG AA. Deferred as design-sensitive (token changes affect the editorial look) — recommend a deliberate palette pass.
- **UTC "today" (P2):** the server derives the current period from the UTC date, so non-UTC users near midnight on a rollover day can see the previous period. Recommend threading a client local-date/timezone.
- **Minor (P3):** payoff "Focus" badge can point at a fully-paid debt (cosmetic); cold page load runs `ensureCurrentPeriod` twice (one-time, cheap); copy-to-clipboard buttons lack a live region; goals/debts per-row Edit/Remove remain visible in read-only mode (no-op safely).

## Notes
- All test data is confined to the `dev_local_user` workbook in the live DB (reset guard). Real users' data was never touched.
- A benign `PGRST116 (0 rows)` log appears on the first load right after a reset (the app falls back to an empty snapshot and self-heals).
