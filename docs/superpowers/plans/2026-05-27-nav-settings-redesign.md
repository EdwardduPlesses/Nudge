# Navigation & Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Condense the flat 6-tab nav into 5 items with two expandable groups (Plan → Budgets/Recurring; Money goals → Goals/Debts), promote Recurring to a first-class tab, and move currency/cycle/sharing/theme/sign-out into a Settings page.

**Architecture:** Restructure `nudge-tab-nav.tsx` into a grouped nav model with a secondary sub-tab strip; the desktop sliding indicator keys off the active TOP-level item. `nudge-app.tsx` tracks `activeTop` + `activeLeaf` and renders the active leaf. New `SettingsTab` and `RecurringTab` relocate existing controls/UI. No backend, schema, or API changes.

**Tech Stack:** Next.js 16, React 19, frosted-ui, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-27-nav-settings-redesign-design.md`

**Branch:** `feat/nav-settings-redesign`

---

## File structure

| File | Responsibility |
|---|---|
| `src/components/nudge/recurring-tab.tsx` (create) | Recurring items as a full page (extracted from the dialog body) |
| `src/components/nudge/settings-tab.tsx` (create) | Settings page: currency, cycle, sharing, theme, sign out |
| `src/components/nudge/nudge-tab-nav.tsx` (modify) | Grouped nav model + `NudgeSubTabs` + nav helpers |
| `src/components/nudge/nudge-tab-nav.test.ts` (create) | unit tests for nav helpers |
| `src/components/nudge/nudge-app.tsx` (modify) | `activeTop`/`activeLeaf` state, sub-tab strip, content switch, gear, chrome cleanup |
| `src/components/nudge/budgets-tab.tsx` (modify) | remove the Recurring button + the anchor-day control (moved to Settings) |
| `src/components/nudge/recurring-dialog.tsx` (delete) | superseded by `recurring-tab.tsx` |

---

## Task 1: Recurring as a first-class tab

**Files:** Create `src/components/nudge/recurring-tab.tsx`; Modify `src/components/nudge/budgets-tab.tsx`; Delete `src/components/nudge/recurring-dialog.tsx`

- [ ] **Step 1: Read** `src/components/nudge/recurring-dialog.tsx` fully — note its data fetching (`GET /api/recurring` via `nudgeBudgetFetchInit`), list rendering, add/edit/delete handlers, the active toggle, and the day-of-period/category controls. Also read `src/components/nudge/goals-tab.tsx` for the page header pattern (the `eyebrow` "N°.." + `heading-display` title).

- [ ] **Step 2: Create `src/components/nudge/recurring-tab.tsx`** as a page component
  `export function RecurringTab()` (no props). Move the dialog's entire body logic into it:
  reuse the same state, the same `GET/POST/PATCH/DELETE /api/recurring` calls (authed via
  `nudgeBudgetFetchInit(whopUserToken, …)` from `useNudgeBudget()`), the same list + add
  form + active toggle. Replace the `Dialog.Root`/`Dialog.Content`/`Dialog.Title`/
  `Dialog.Description`/`Dialog.Close` chrome with a plain page layout:
  - A header block matching other tabs: `<span className="eyebrow">…Recurring</span>` and an
    `<h2 className="heading-display">Recurring</h2>` with a one-line description ("Income and
    bills that are added automatically at the start of each new budget period.").
  - The list + form rendered directly in `div`s (atelier-card styling like the dialog used).
  - Keep the load-on-mount effect; if it trips `react-hooks/set-state-in-effect`, carry over
    the same scoped `// eslint-disable-next-line` the dialog had.
  - Drop the `open`/`onOpenChange` props entirely.

- [ ] **Step 3: Update `budgets-tab.tsx`** — remove the `import { RecurringDialog }`, the
  `recurringOpen` state, the "Recurring items" `Button`, and the `<RecurringDialog … />`
  render. (Leave the rest of the Categories section intact. The anchor-day control is removed
  in Task 2 — do not touch it here.)

- [ ] **Step 4: Delete the dialog**

Run: `git rm src/components/nudge/recurring-dialog.tsx`
First confirm nothing else imports it: `npm run lint` / search — only `budgets-tab.tsx`
referenced it (now removed). If another file imports it, STOP and report.

- [ ] **Step 5: Verify** `npx tsc --noEmit` clean (note: `RecurringTab` isn't wired into the
  content switch until Task 4, so it's an unused export for now — that's fine, exports aren't
  "unused" errors). `npm run build` passes.

- [ ] **Step 6: Commit**

```bash
git add src/components/nudge/recurring-tab.tsx src/components/nudge/budgets-tab.tsx
git rm src/components/nudge/recurring-dialog.tsx
git commit -m "feat(ui): recurring items as a first-class tab"
```

---

## Task 2: Settings page

**Files:** Create `src/components/nudge/settings-tab.tsx`; Modify `src/components/nudge/budgets-tab.tsx`

Context: `useCurrency()` → `{ currencyCode, changeCurrency }` + `displayCurrencyItems()`.
`useNudgeBudget()` → `{ periodAnchorDay, setPeriodAnchorDay, state }` (and `state.editable`).
`SharingDialog` is `{ open, onOpenChange }`. `ThemeToggle` is a self-contained component.
The anchor-day `Select` (days 1–28 + "Last day of month"=31) currently lives in
`budgets-tab.tsx` — move it here.

- [ ] **Step 1: Read** `src/components/nudge/budgets-tab.tsx` to copy the EXACT anchor-day
  `Select` markup (the items list + the `setPeriodAnchorDay(Number(v))` handler), and
  `src/components/nudge/nudge-app.tsx` for the currency `Select` markup + the sign-out form +
  `ThemeToggle` usage. Match `docs/nudge-ui-standards.md` (eyebrow labels, atelier-card).

- [ ] **Step 2: Create `src/components/nudge/settings-tab.tsx`**:

```tsx
"use client";

import { useState } from "react";
import { Select } from "frosted-ui";
import { SharingDialog } from "@/components/nudge/sharing-dialog";
import { ThemeToggle } from "@/components/nudge/theme-toggle";
import { displayCurrencyItems, useCurrency } from "@/context/currency-context";
import { useNudgeBudget } from "@/context/nudge-budget-context";
import type { DisplayCurrency } from "@/lib/currency-config";

function Row(props: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b py-5 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--hairline)" }}>
      <div className="min-w-0">
        <span className="eyebrow block">{props.label}</span>
        {props.hint ? <span style={{ color: "var(--ink-muted)", fontSize: "0.82rem" }}>{props.hint}</span> : null}
      </div>
      <div className="shrink-0">{props.children}</div>
    </div>
  );
}

const ANCHOR_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

export function SettingsTab(props: { showSignOut?: boolean }) {
  const { currencyCode, changeCurrency } = useCurrency();
  const { periodAnchorDay, setPeriodAnchorDay } = useNudgeBudget();
  const [shareOpen, setShareOpen] = useState(false);
  const items = displayCurrencyItems();

  return (
    <div className="flex flex-col gap-7">
      <header>
        <span className="eyebrow"><span className="eyebrow-gold">N°00</span>
          <span aria-hidden style={{ margin: "0 0.5em", color: "var(--ink-faint)" }}>—</span>Preferences</span>
        <h2 className="heading-display mt-3" style={{ color: "var(--ink)", fontSize: "clamp(1.6rem, 3.6vw, 2.15rem)", lineHeight: 1.1 }}>Settings</h2>
      </header>

      <section className="atelier-card px-4 py-2 sm:px-6">
        <Row label="Display currency" hint="Changing this converts all amounts at today's rate.">
          <Select.Root value={currencyCode} onValueChange={(v) => void changeCurrency(v as DisplayCurrency)}>
            <Select.Trigger placeholder="Currency" aria-label="Display currency" className="min-h-10 min-w-[12rem]" />
            <Select.Content>
              {items.map((it) => (<Select.Item key={it.code} value={it.code}>{it.label}</Select.Item>))}
            </Select.Content>
          </Select.Root>
        </Row>

        <Row label="Budget cycle" hint="The day each budget period starts.">
          <Select.Root value={String(periodAnchorDay)} onValueChange={(v) => void setPeriodAnchorDay(Number(v))}>
            <Select.Trigger placeholder="Day" aria-label="Budget cycle start day" className="min-h-10 min-w-[12rem]" />
            <Select.Content>
              {ANCHOR_DAYS.map((d) => (<Select.Item key={d} value={String(d)}>{`Day ${d}`}</Select.Item>))}
              <Select.Item value="31">Last day of month</Select.Item>
            </Select.Content>
          </Select.Root>
        </Row>

        <Row label="Sharing" hint="Invite one other person to share this budget.">
          <button type="button" className="nudge-topbar-link" onClick={() => setShareOpen(true)}>Manage →</button>
        </Row>

        <Row label="Appearance" hint="Light or dark theme.">
          <ThemeToggle />
        </Row>

        {props.showSignOut ? (
          <Row label="Account">
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="nudge-topbar-link">Sign out</button>
            </form>
          </Row>
        ) : null}
      </section>

      <SharingDialog open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  );
}
```

- [ ] **Step 3: Remove the anchor-day control from `budgets-tab.tsx`** — delete the anchor-day
  `Select` block and any now-unused `periodAnchorDay`/`setPeriodAnchorDay` references there.
  (Leave income inputs and categories intact.)

- [ ] **Step 4: Verify** `npx tsc --noEmit` clean; `npm run build` passes. (`SettingsTab`
  unused until Task 4 — fine.)

- [ ] **Step 5: Commit**

```bash
git add src/components/nudge/settings-tab.tsx src/components/nudge/budgets-tab.tsx
git commit -m "feat(ui): settings page (currency, cycle, sharing, theme, sign out)"
```

---

## Task 3: Grouped nav model + sub-tabs + helpers

**Files:** Modify `src/components/nudge/nudge-tab-nav.tsx`; Create `src/components/nudge/nudge-tab-nav.test.ts`

- [ ] **Step 1: Read** the current `nudge-tab-nav.tsx` — keep the existing icon render
  functions for overview/activity/insights/budgets/goals/debts; keep `DesktopTabPill`'s sliding
  indicator mechanics and `NudgeMobileTabBar`'s underline mechanics.

- [ ] **Step 2: Write failing tests** (`src/components/nudge/nudge-tab-nav.test.ts`):

```ts
import { expect, test } from "vitest";
import { defaultLeafFor, topKeyForLeaf, type NudgeLeafKey } from "./nudge-tab-nav";

test("defaultLeafFor returns the group's first child", () => {
  expect(defaultLeafFor("plan")).toBe("budgets");
  expect(defaultLeafFor("money")).toBe("goals");
});

test("defaultLeafFor returns the same key for a single item", () => {
  expect(defaultLeafFor("overview")).toBe("overview");
  expect(defaultLeafFor("activity")).toBe("activity");
  expect(defaultLeafFor("insights")).toBe("insights");
});

test("topKeyForLeaf maps a leaf back to its top-level key", () => {
  expect(topKeyForLeaf("budgets")).toBe("plan");
  expect(topKeyForLeaf("recurring")).toBe("plan");
  expect(topKeyForLeaf("goals")).toBe("money");
  expect(topKeyForLeaf("debts")).toBe("money");
  expect(topKeyForLeaf("overview" as NudgeLeafKey)).toBe("overview");
});
```

- [ ] **Step 3: Run, confirm FAIL.** `npm run test src/components/nudge/nudge-tab-nav.test.ts`

- [ ] **Step 4: Restructure the nav model.** Replace the `NudgeTabKey` union + flat `TABS`
  with grouped types and tables. Add at the top:

```ts
export type NudgeLeafKey =
  | "overview" | "activity" | "insights" | "budgets" | "recurring" | "goals" | "debts" | "settings";
export type NudgeTopKey = "overview" | "activity" | "plan" | "money" | "insights";

export type NavChild = { key: NudgeLeafKey; label: string };
export type NavTop = {
  key: NudgeTopKey;
  label: string;
  hint: string;
  icon: (props: { className?: string }) => React.JSX.Element;
  children?: NavChild[];
};
```

  Build `NAV: NavTop[]` reusing the existing icon functions: `overview`, `activity`, then
  `{ key:"plan", label:"Plan", hint:"Budget", icon:<budget icon>, children:[{key:"budgets",label:"Budgets"},{key:"recurring",label:"Recurring"}] }`,
  then `{ key:"money", label:"Money goals", hint:"Targets", icon:<goals icon>, children:[{key:"goals",label:"Goals"},{key:"debts",label:"Debts"}] }`,
  then `insights`. (Reuse the budgets icon for Plan and the goals icon for Money goals, or add
  two simple new stroke SVGs — your choice; keep them visually consistent.)

  Then the pure helpers:

```ts
export function defaultLeafFor(top: NudgeTopKey): NudgeLeafKey {
  const item = NAV.find((n) => n.key === top);
  if (item?.children && item.children.length > 0) return item.children[0].key;
  return top as unknown as NudgeLeafKey; // single items: top key === leaf key
}

export function topKeyForLeaf(leaf: NudgeLeafKey): NudgeTopKey {
  for (const n of NAV) {
    if (n.key === (leaf as unknown as NudgeTopKey)) return n.key;
    if (n.children?.some((c) => c.key === leaf)) return n.key;
  }
  return "overview";
}
```

- [ ] **Step 5: Update `NudgeTopBar`/`DesktopTabPill` and `NudgeMobileTabBar`** to take
  `value: NudgeTopKey` and `onChange: (k: NudgeTopKey) => void`, and map over `NAV` (top-level)
  instead of the old `TABS`. The sliding indicator / underline logic is unchanged except it
  keys off the top-level `NAV` items. Keep all existing class names and markup.

- [ ] **Step 6: Add a `NudgeSubTabs` component** (exported) that renders a group's children as
  a secondary strip:

```tsx
export function NudgeSubTabs(props: {
  items: NavChild[];
  value: NudgeLeafKey;
  onChange: (k: NudgeLeafKey) => void;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Sub-sections">
      {props.items.map((c) => {
        const active = props.value === c.key;
        return (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active ? "true" : undefined}
            className="nudge-subtab"
            onClick={() => props.onChange(c.key)}
          >
            {c.label}
          </button>
        );
      })}
    </nav>
  );
}
```

  Add a `.nudge-subtab` style to `src/app/globals.css` (small pill; active uses
  `--hairline-gold`/`--gold` like the existing `FilterPill`). Match the existing pill styling.

- [ ] **Step 7: Run tests, confirm pass.** `npm run test src/components/nudge/nudge-tab-nav.test.ts`
  → 4 passed. `npx tsc --noEmit` — errors now appear in `nudge-app.tsx` (uses old
  `NudgeTabKey`/flat keys) — fixed in Task 4. The nav file + its test compile.

- [ ] **Step 8: Commit**

```bash
git add src/components/nudge/nudge-tab-nav.tsx src/components/nudge/nudge-tab-nav.test.ts src/app/globals.css
git commit -m "feat(ui): grouped nav model + sub-tab strip + helpers"
```

---

## Task 4: Wire it together in nudge-app

**Files:** Modify `src/components/nudge/nudge-app.tsx`

- [ ] **Step 1: New state model.** Replace `const [tab, setTab] = useState<TabKey>("overview")`
  with:

```tsx
const [activeTop, setActiveTop] = useState<NudgeTopKey | "settings">("overview");
const [activeLeaf, setActiveLeaf] = useState<NudgeLeafKey>("overview");

const selectTop = (top: NudgeTopKey) => {
  setActiveTop(top);
  setActiveLeaf(defaultLeafFor(top));
};
const openSettings = () => {
  setActiveTop("settings");
  setActiveLeaf("settings");
};
```

  Import `NudgeTopKey`, `NudgeLeafKey`, `NAV`, `NudgeSubTabs`, `defaultLeafFor` from
  `./nudge-tab-nav`, plus `SettingsTab` and `RecurringTab`.

- [ ] **Step 2: Top bar + mobile bar** now take the top key. Pass
  `value={activeTop === "settings" ? ("" as NudgeTopKey) : activeTop}` (so no pill is
  highlighted on Settings; the indicator hides when no button matches — verify the indicator
  code tolerates a missing ref, which it does: `if (!list || !btn) return`) and
  `onChange={selectTop}` to both `NudgeTopBar` and `NudgeMobileTabBar`.

- [ ] **Step 3: Chrome cleanup.** Remove from the top-bar `actions` and the mobile masthead:
  `TopBarCurrencySelect`, `HeaderCurrencySelect`, the Share buttons, `ThemeToggle`, and the
  Sign-out forms. Delete the now-unused `HeaderCurrencySelect`/`TopBarCurrencySelect`/
  `SignOutButton` helper functions and the `SharingDialog` import + `shareOpen` state (Sharing
  now lives in `SettingsTab`). KEEP `<PeriodSelector />` in both the desktop strip and mobile
  masthead. Add a **gear** control in their place:

```tsx
// in the top-bar actions:
<button type="button" className="nudge-topbar-link" aria-label="Settings" onClick={openSettings}>⚙ Settings</button>
// in the mobile masthead actions cluster (next to where ThemeToggle was):
<button type="button" className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white" aria-label="Settings" onClick={openSettings}>⚙</button>
```

- [ ] **Step 4: Sub-tab strip.** Just above the content `role="tabpanel"` div, render the strip
  when the active top item is a group:

```tsx
{(() => {
  const item = NAV.find((n) => n.key === activeTop);
  return item?.children ? (
    <NudgeSubTabs items={item.children} value={activeLeaf} onChange={setActiveLeaf} />
  ) : null;
})()}
```

- [ ] **Step 5: Content switch** keyed on `activeLeaf` (replace the old `tab === …` block):

```tsx
{activeLeaf === "overview" ? <DashboardTab /> : null}
{activeLeaf === "activity" ? <ActivityTab /> : null}
{activeLeaf === "insights" ? <InsightsTab /> : null}
{activeLeaf === "budgets" ? <BudgetsTab /> : null}
{activeLeaf === "recurring" ? <RecurringTab /> : null}
{activeLeaf === "goals" ? <GoalsTab /> : null}
{activeLeaf === "debts" ? <DebtsTab /> : null}
{activeLeaf === "settings" ? <SettingsTab showSignOut={props.showSignOut} /> : null}
```

- [ ] **Step 6: Verify** `npx tsc --noEmit && npm run build` pass; `npm run test` green;
  `npm run lint` ≤ baseline (currently 7). Reason through: each top item selects and shows its
  default content; Plan/Money show the sub-strip and switch children; the gear shows Settings;
  the period selector still works; nothing references removed chrome helpers.

- [ ] **Step 7: Commit**

```bash
git add src/components/nudge/nudge-app.tsx
git commit -m "feat(ui): grouped nav + sub-tabs + settings gear in app shell"
```

---

## Task 5: Validate & merge

- [ ] **Step 1:** `npm run lint && npx tsc --noEmit && npm run build && npm run test` — all
  clean/green; lint ≤ 7 problems (no new). No migration (presentational only).

- [ ] **Step 2: Manual smoke (dev):** `npm run dev` — top nav shows Overview · Activity · Plan ·
  Money goals · Insights + ⚙; Plan reveals Budgets/Recurring sub-tabs; Money goals reveals
  Goals/Debts; Recurring page adds/edits items; Settings changes currency (converts), cycle,
  opens Share, toggles theme, signs out; period selector still in the header; mobile bar +
  masthead gear work.

- [ ] **Step 3: Merge**

```bash
git checkout main && git merge --no-ff feat/nav-settings-redesign
git push origin main
```

---

## Self-review

- **Spec coverage:** 5-item grouped nav (Task 3 `NAV` + Task 4 wiring) ✓; sub-tab strip
  (Task 3 `NudgeSubTabs` + Task 4) ✓; Settings view with currency/cycle/sharing/theme/sign-out
  (Task 2) ✓; Recurring as its own section (Task 1) ✓; anchor-day moved out of Budgets (Task 2)
  ✓; chrome cleanup, period selector kept in header (Task 4) ✓; no backend/schema/API changes ✓.
- **Placeholder scan:** none — concrete code for `SettingsTab`, nav types/helpers, `NudgeSubTabs`,
  and the app-shell wiring; Tasks 1/2 extraction steps reference exact existing source to copy.
- **Type consistency:** `NudgeTopKey`/`NudgeLeafKey`/`NAV`/`defaultLeafFor`/`topKeyForLeaf`/
  `NudgeSubTabs` defined in Task 3 are used consistently in Task 4; `SettingsTab`(props
  `showSignOut`) and `RecurringTab`(no props) match their Task 4 call sites; `setPeriodAnchorDay`/
  `periodAnchorDay`/`currencyCode`/`changeCurrency` match the existing context APIs.
