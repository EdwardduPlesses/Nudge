# Nudge UI standards

Design and layout rules for the Nudge budgeting app (React + Tailwind + frosted-ui). Use these patterns so lists, cards, and currency stay scannable on mobile and desktop.

---

## Spacing rules

- **Section rhythm**: Prefer `gap-6`–`gap-8` between major sections; `gap-3`–`gap-4` inside cards.
- **Prefer `gap-*` on flex/grid parents** over chaining `mt-*` on every child, except where typography scale already defines vertical rhythm.
- **Touch targets**: Keep controls at least ~44px tall on small screens (see `.nudge-field` in `globals.css`).
- **Safe area**: The app shell (`.nudge-app-shell`) adds bottom padding for notched devices; do not zero it out on tab roots.

---

## Card layout rules

- Use frosted-ui `Card` with `size="3"` and the shared surface class **`nudge-card-surface`** (see `globals.css`) for elevation and radius consistency.
- **Internal padding**: Rely on Card padding; add inner wrappers with `gap-4` or `gap-5` rather than arbitrary large margins.
- **Nested tiles** (category chips, goal mini-cards): `rounded-2xl border border-gray-600/15 bg-gray-900/4 p-4 dark:bg-white/4` (or equivalent) with `gap-3`–`gap-4` between label row, amounts, and progress.

---

## Typography hierarchy

| Role | Guidance |
|------|-----------|
| Page / tab title | `Heading size="6"` or `7` on dashboard hero; `tracking-tight` |
| Card title | `Heading size="4"` |
| Primary stat / amount | `Heading size="5"`–`6` with `tabular-nums` |
| Secondary label | `Text size="2"` + `weight="medium"` or `color="gray"` |
| Metadata / hints | `Text size="1"`–`2"` + `color="gray"` + `leading-relaxed` |
| Uppercase filters | `size="1"` + `tracking-wide uppercase` |

Always use **`tabular-nums`** for currency and percentages so columns align when multi-line.

---

## Button styling rules

- **Primary actions** (save, add): `Button` `size="3"` `color="gold"` + `shadow-sm`; full width on mobile (`w-full`) and `sm:w-auto` when beside other actions.
- **Secondary**: `variant="soft"` `color="gray"` `size="2"` or `3`.
- **Destructive**: `color="red"` with `variant="soft"` for row actions; `ghost` only when space is tight and the action is clearly labeled.
- **Filter chips**: `size="2"`, `rounded-full`, `solid` + `gold` when selected, `soft` + `gray` when not.

Action groups: `flex flex-col-reverse gap-2 sm:flex-row sm:justify-end` so the primary button sits last visually on desktop but on top on mobile when stacked.

---

## Form / input styling rules

- Wrap fields in **`TextField.Root` with `className="nudge-field w-full"`** (or constrained width where appropriate).
- **Labels**: `Text size="2" weight="medium" className="mb-2 block text-foreground/80"` (or `mb-3` for dense radio groups).
- **Optional hints**: `(optional)` in `font-normal text-gray-500` inline with the label.
- **Grid forms**: `grid gap-4 sm:grid-cols-2` for name + amount pairs; stack on small screens.

---

## Row / list layout rules

**Standard row**: label / description on the left (`min-w-0`), amount or actions on the right (`shrink-0`). Always include horizontal gap so text and numbers never touch.

```tsx
// Good row layout
<div className="flex items-center justify-between gap-4">
  <div className="min-w-0">
    <p className="truncate">Food & groceries</p>
    <p className="text-sm text-gray-500">Monthly category</p>
  </div>
  <p className="shrink-0 text-right font-semibold tabular-nums">$450.00</p>
</div>
```

- **`min-w-0`** on the left column allows truncation inside flex children.
- **`shrink-0`** on amounts and buttons prevents squashing.
- Use **`flex-wrap`** or **`flex-col sm:flex-row`** when a row must not overflow narrow widths.

---

## Currency / amount display rules

- Format via **`useCurrency().formatFromUsd`** (or passed-in formatter); do not concat raw numbers in UI.
- **Alignment**: Right-align amounts in summary rows and list trailing columns (`text-right`).
- **Classes**: `tabular-nums tracking-tight`; add `font-semibold` or `weight="bold"` for the primary number in a row.
- **Ratios** (e.g. `saved / target`): keep both sides tabular; if space is tight, stack on `xs` or allow wrap with `gap-x-2` so `$` glyphs do not collide with labels.

---

## Mobile responsiveness rules

- **No horizontal overflow**: Root shell uses `overflow-x-hidden`; lists use `min-w-0` on flex children; charts use measured widths (see `WeekBarChart` / `CategoryPie`).
- **Dialogs**: `max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain` on `Dialog.Content` so long forms scroll inside the viewport.
- **Tables-as-lists**: Prefer cards or stacked rows over wide tables; use `w-full` + `flex-col` on small breakpoints.
- **Charts**: Give chart containers `min-w-0`; resize chart width with the container (ResizeObserver pattern), not a fixed pixel width wider than the phone.

---

## Empty state rules

- **Container**: `Card` + `variant="surface"` + `border border-dashed border-gray-600/30` + comfortable vertical padding (`py-10`–`py-12`).
- **Copy**: `Text color="gray" leading-relaxed text-center`; bold the actionable control name (`Add transaction`, `New goal`).
- Keep empty states **one short paragraph**; link or imply the primary button in the header/toolbar.

---

## Modal / dialog rules

- **Width**: `max-w-[min(calc(100vw-1.5rem),24rem)]` for forms; wider prompts may use `40rem` with a flex column and `flex-1` scroll body.
- **Scroll**: Always constrain height on small screens and scroll **content**, not the page behind the overlay.
- **Footer actions**: `mt-8` from last field; `gap-2` between buttons; primary gold button full width on mobile.
- **Title + description**: Keep `Dialog.Description` concise; use `leading-relaxed` for multi-line hints.

Example dialog shell:

```tsx
<Dialog.Content
  size="3"
  className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain max-w-[min(calc(100vw-1.5rem),24rem)] sm:max-w-md"
>
  <Dialog.Title>Add transaction</Dialog.Title>
  <Dialog.Description size="2" color="gray" className="leading-relaxed">
    Short supporting text.
  </Dialog.Description>
  {/* fields with gap-5 */}
  <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
    <Dialog.Close>
      <Button variant="soft" color="gray" size="3" className="w-full sm:w-auto">
        Cancel
      </Button>
    </Dialog.Close>
    <Button size="3" color="gold" className="w-full sm:w-auto">
      Save
    </Button>
  </div>
</Dialog.Content>
```

---

## Activity row (stacked meta + trailing amount)

For transaction lists, put **type, date, category, and note** in a **`min-w-0`** column and **amount + actions** in a trailing column so long notes do not collide with large numbers.

```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
  <div className="min-w-0 flex-1 space-y-1.5">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">{/* badges, date */}</div>
    <p className="text-sm wrap-break-word text-gray-500">{/* category · goal */}</p>
    {note ? <p className="text-sm wrap-break-word text-foreground/80 line-clamp-4">{note}</p> : null}
  </div>
  <div className="flex shrink-0 flex-col gap-3 sm:items-end">
    <p className="text-right text-xl font-bold tabular-nums tracking-tight sm:text-lg">{amount}</p>
    <div className="flex flex-col gap-2 sm:flex-row">{/* Edit, Remove */}</div>
  </div>
</div>
```

---

## File references

| Area | Main files |
|------|------------|
| Shell / tabs | `src/components/nudge/nudge-app.tsx` |
| Dashboard | `src/components/nudge/dashboard-tab.tsx`, `src/components/nudge/dashboard/*` |
| Budgets / goals / activity | `src/components/nudge/budgets-tab.tsx`, `goals-tab.tsx`, `activity-tab.tsx` |
| Transactions | `src/components/nudge/add-transaction-dialog.tsx` |
| Charts | `src/components/nudge/charts.tsx` |
| Global tokens / field height | `src/app/globals.css` |

When in doubt, match existing **`nudge-card-surface`**, **`nudge-field`**, and **`text-gold-primary`** accents for brand consistency.
