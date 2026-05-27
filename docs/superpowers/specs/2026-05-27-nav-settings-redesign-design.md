# Nudge — navigation & settings redesign

Status: design draft
Date: 2026-05-27

## Goal

Condense the flat 6-tab navigation into grouped submenus, give recurring items a
first-class home, and move app-level controls (currency, theme, sign out, sharing) into
a dedicated Settings view. Driven by real discoverability friction: recurring items were
hidden behind a grey button in the Budgets tab, and currency/theme lived in the top-bar
chrome.

## Current state

- Tabs (flat, in `src/components/nudge/nudge-tab-nav.tsx` `TABS` + `NudgeTabKey`):
  Overview, Activity, Insights, Budgets, Goals, Debts. Rendered by `NudgeTopBar`
  (desktop pill with a sliding indicator) and `NudgeMobileTabBar` (bottom bar).
- Content switch in `src/components/nudge/nudge-app.tsx` (`{tab === "..." ? <X/> : null}`).
- Top-bar chrome: currency `Select` (desktop `TopBarCurrencySelect` + mobile
  `HeaderCurrencySelect`), `PeriodSelector`, `ThemeToggle`, Sign out (`<form>`), Share
  button (opens `SharingDialog`).
- Recurring items: `RecurringDialog` opened from a grey "Recurring items" button in the
  Categories header of `budgets-tab.tsx`.
- Budget anchor-day: a `Select` inside `budgets-tab.tsx`.

## Target navigation

Five top-level items plus a Settings gear:

```
Overview · Activity · Plan ▾ · Money goals ▾ · Insights        ⚙ Settings
```

- **Plan** (group) → sub-tabs: **Budgets**, **Recurring**
- **Money goals** (group) → sub-tabs: **Goals**, **Debts**
- **Overview**, **Activity**, **Insights** — single tabs (no children)
- **Settings** — opened by the gear, a full view in the content area

## Submenu interaction — secondary sub-tab strip

- Selecting a group tab activates it and renders a **secondary tab row** beneath the main
  nav, defaulting to the group's first child (Plan → Budgets; Money goals → Goals).
- Applies to both desktop and mobile. The mobile bottom bar shows the 5 top-level items;
  the sub-tab strip renders above the content area when the active top-level item is a
  group. No popovers.
- The desktop sliding indicator keys off the active **top-level** item; the sub-tab strip
  has its own lightweight active styling (reuse existing pill/strip styles).

## Settings view (full page, opened by the gear)

`src/components/nudge/settings-tab.tsx` — stacked sections, relocating existing controls
(not rebuilding them):

- **Display currency** — moves `TopBarCurrencySelect`/`HeaderCurrencySelect` here (reuse
  `useCurrency()` + `displayCurrencyItems()`).
- **Budget cycle** — moves the anchor-day `Select` out of `budgets-tab.tsx`; calls
  `setPeriodAnchorDay` from the budget context.
- **Sharing** — a "Manage →" button that opens the existing `SharingDialog` (the dialog
  is unchanged; only its trigger moves here).
- **Appearance** — moves `ThemeToggle` here.
- **Account** — moves the Sign-out `<form action="/api/auth/logout">` here.

## Recurring as its own section

`src/components/nudge/recurring-tab.tsx` — the body of today's `RecurringDialog` becomes
a first-class page rendered as the **Recurring** sub-tab under Plan. Reuse the existing
fetch/list/add/edit/delete logic against `/api/recurring`; drop the `Dialog` chrome. The
"Recurring items" button and `RecurringDialog` usage are removed from `budgets-tab.tsx`.
(`recurring-dialog.tsx` may be deleted once its logic lives in the tab, or kept only if
still referenced — the plan will confirm no other importer.)

## Chrome after the change

Header keeps: brand, main nav (with sub-tab strip), **PeriodSelector** (time navigation,
not a setting), and the **⚙ Settings** entry. Removed from the header: currency, theme,
sign out, Share button (all now under Settings).

## Implementation shape

- **`nudge-tab-nav.tsx`**: model becomes grouped — `type NavItem = { key; label; hint; icon;
  children?: { key; label }[] }`. `NudgeTabKey` expands to all leaves + group keys +
  `"settings"`. `NudgeTopBar`/`NudgeMobileTabBar` render top-level items; a new
  `NudgeSubTabs` component renders the active group's children. The sliding indicator
  tracks the active top-level key.
- **`nudge-app.tsx`**: hold `activeTab` (top-level) and `activeSubTab` (leaf within a
  group). Selecting a group sets `activeTab` and defaults `activeSubTab` to its first
  child. Content switch renders the active leaf: `overview`, `activity`, `insights`,
  `budgets`, `recurring`, `goals`, `debts`, `settings`. Add the gear control that sets
  `activeTab = "settings"`.
- **New files**: `settings-tab.tsx`, `recurring-tab.tsx`, `nudge-sub-tabs.tsx`.
- **Edited**: `nudge-tab-nav.tsx`, `nudge-app.tsx`, `budgets-tab.tsx` (remove anchor-day
  control + recurring button).
- No backend, schema, or API changes. No data-model changes.

## Non-goals

- No changes to budgets/goals/debts/recurring functionality themselves (only where they
  live in the nav).
- No new settings beyond relocating the four existing controls + sign out.
- No deep-linking/URL routing for tabs (state-driven tabs stay as today).
- Period selector stays in the header (not moved).

## Testing

- Manual: each top-level item and sub-tab renders the correct content; sub-tab strip
  appears only for groups; Settings sections all work (currency change persists, anchor-day
  change rolls the period, Share dialog opens, theme toggles, sign out posts to logout);
  recurring add/edit/delete works as a tab; desktop indicator + mobile bar both reflect
  the active top-level item.
- `npx tsc --noEmit`, `npm run build`, `npm run lint` (≤ baseline), `npm run test` green
  (no new unit logic expected; this is presentational).
