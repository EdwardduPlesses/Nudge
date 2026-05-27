# Shared Budgets — Plan Index (plan-of-plans)

> **For agentic workers:** This is the master index. Execute the **Foundation** plan first
> and merge it to `main`. Only then dispatch the workstream plans in parallel.

**Source spec:** `docs/superpowers/specs/2026-05-27-shared-budget-collaboration-design.md`

## Why a plan-of-plans

The feature spans several subsystems. They share one foundation (data model + membership
+ per-item API + period-aware loading + context refactor). Once that foundation is on
`main`, the remaining workstreams are independent and can be built by parallel agents,
each on its own branch, merged to `main` after validation.

## Dependency graph

```
                 ┌─────────────────────────────┐
                 │ Plan 0: FOUNDATION          │  (sequential, blocks all)
                 │ migration · membership ·    │
                 │ period math · per-item API ·│
                 │ period-aware load · context │
                 └──────────────┬──────────────┘
                                │ merge to main
        ┌───────────┬───────────┼───────────┬───────────┬──────────┐
        ▼           ▼           ▼           ▼           ▼          ▼
   A: Sharing   B: Periods   C: Attribution  D: Recurring  E: Debt   F: Safe-
   & invites    UI &          & activity &    items         tracker   to-spend
                history       per-person dash                          card
```

Workstreams A–F do **not** depend on each other. They depend only on Foundation.

## Sub-plans

| # | Plan file | Branch | Depends on |
|---|---|---|---|
| 0 | `2026-05-27-foundation-shared-budgets.md` | `feat/foundation-shared-budgets` | — |
| A | `2026-05-27-ws-sharing-invites.md` | `feat/sharing-invites` | Foundation |
| B | `2026-05-27-ws-periods-history.md` | `feat/budget-periods-ui` | Foundation |
| C | `2026-05-27-ws-attribution-activity.md` | `feat/attribution-activity` | Foundation |
| D | `2026-05-27-ws-recurring-items.md` | `feat/recurring-items` | Foundation |
| E | `2026-05-27-ws-debt-tracker.md` | `feat/debt-tracker` | Foundation |
| F | `2026-05-27-ws-safe-to-spend.md` | `feat/safe-to-spend` | Foundation |

Workstream plans are authored **just-in-time**, immediately before each workstream's agent
starts, so they target the finalized Foundation interfaces (route shapes, context API,
DB types) rather than guesses. The Foundation plan deliberately creates clean **extension
seams** (a tab registry, a typed mutation API on the context, additive route modules) so
workstreams add new files and make minimal additive edits to shared files.

## Parallel build & merge strategy (agents)

1. **Foundation** is built first (single agent or this session), validated, merged to `main`.
   Validation gate for every merge: `npm run lint` clean, `npm run build` succeeds,
   `npm run test` (Vitest, added in Foundation) green.
2. Each workstream agent runs in an **isolated git worktree** (`isolation: "worktree"`)
   branched off the latest `main`.
3. Merge order to `main` is sequential to keep conflicts trivial: after each workstream
   merges, the remaining in-flight branches rebase on `main`.
4. **Known shared-file touch points** (coordinate / keep edits additive):
   - `src/components/nudge/nudge-app.tsx` — tab registration (Foundation adds a registry).
   - `src/context/nudge-budget-context.tsx` — context mutation API (Foundation makes it
     per-item; workstreams add methods, never rewrite existing ones).
   - `src/components/nudge/dashboard-tab.tsx` — workstreams C/F add cards.
   - `supabase/migrations/` — Foundation owns the big migration; workstreams add their own
     additive migration files only if they need new columns/tables not already created.
5. The user (human/pipeline) runs `npm run db:push` to apply migrations to Supabase
   (agents only commit SQL — DB credentials stay out of the agent session).

## Self-review (index)

- Every spec section maps to a plan: data model/migration/per-item API/period loading →
  Foundation; §2 invites → A; §4/§8 periods+history → B (data) + Foundation (schema);
  §6 attribution + activity + per-person dashboards → C; recurring → D; debt → E;
  safe-to-spend → F. ✓
- No workstream depends on another. ✓
