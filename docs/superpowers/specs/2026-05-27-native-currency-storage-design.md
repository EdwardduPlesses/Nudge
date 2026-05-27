# Nudge — native-currency storage

Status: design draft
Date: 2026-05-27

## Goal

Store every monetary amount in the budget's own currency (e.g. ZAR), exactly as entered,
instead of the current model where amounts are stored as USD-equivalents and converted
through live FX rates for display. The round-trip conversion causes drift and rounding
error — you type R100, it's stored as ~$5.38, and converts back to something near (but not)
R100 at a later rate. After this change, a rand is a rand.

## Current model (what we're replacing)

- All amounts are stored as **USD-equivalent** doubles (per `CODEBASE.md` and
  `src/lib/currency-config.ts`: "canonical stored amounts stay USD-equivalent").
- `CurrencyPreferenceProvider` / `useCurrency()` (`src/context/currency-context.tsx`)
  holds a display-currency preference + live FX rates (from `GET /api/exchange-rate`,
  Frankfurter). Components render via `formatFromUsd(usd)`; input dialogs convert the typed
  value to USD via a `displayAmountAsUsd`-style helper before saving.
- Display currencies: USD, ZAR, EUR, GBP, JPY (`DisplayCurrency`).

## Target model — single base currency per workbook

### Data model
- Add `base_currency text not null default 'USD'` to `nudge_workbooks` (one per workbook,
  shared by both members).
- The existing amount columns are **reinterpreted** as being in the workbook's
  `base_currency` (no column type changes). They are: `nudge_transactions.amount`,
  `nudge_period_incomes.planned_amount`, `nudge_period_category_limits.budget_limit`,
  `nudge_goals.target_amount` and `saved_amount`, `nudge_debts.balance` and `min_payment`,
  `nudge_recurring_items.amount`.

### Migration (non-destructive, no conversion)
- A single additive migration adds `base_currency` defaulting to `'USD'`. Existing values
  are already USD-equivalents, so defaulting to USD is correct and **no amounts are
  converted at migration time**. No data loss.

### Changing the budget currency = one-time convert-all
- Conversion happens only when a user changes the currency in Settings (e.g. USD → ZAR),
  never silently.
- `PATCH /api/workbook { baseCurrency }` (extends the workbook route):
  1. Reject if `baseCurrency` is unchanged or not a supported code.
  2. Look up the live rate `from → to` (reuse `GET /api/exchange-rate` logic; both are
     expressed via USD multipliers in `FALLBACK_USD_RATES`, so derive cross-rate
     `rate = usdTo / usdFrom`, with the documented fallbacks if the API is unavailable).
  3. Multiply **every** amount in the workbook (all columns listed above) by `rate`,
     rounding to the target currency's decimals (`intlCurrencyOptions` → ZAR/EUR/GBP 2dp,
     JPY 0dp).
  4. Set `nudge_workbooks.base_currency = to`.
  5. Append a `nudge_activity` entry ("changed budget currency to ZAR").
- Ordering: update amounts first, then the `base_currency` flag, so a mid-failure leaves
  amounts in the old currency with the old flag (consistent), recoverable by retrying.
  (Supabase JS has no multi-statement transaction; document this, mirroring the invite
  accept-flow note.)

### Display & input — no FX round-trip
- `useCurrency()` is reworked: it receives the workbook's `base_currency` and exposes
  `currencyCode`, `formatAmount(amount)` (native `Intl` formatting via the existing
  `intlCurrencyOptions`/`localeForCurrency`), and `parseAmount(text): number` (plain numeric
  parse — no conversion). It no longer fetches or applies FX rates for display.
- Rename for clarity (this is a semantic change, not a silent no-op):
  - `formatFromUsd(x)` → `formatAmount(x)` across all call sites.
  - The `displayAmountAsUsd(...)` input conversion is removed; dialogs save the typed
    number directly.
- The `base_currency` is loaded on the server (it's on the workbook) and provided to
  `CurrencyPreferenceProvider` as the initial/authoritative value, replacing the
  localStorage display-preference as the source of truth. (localStorage may still cache it
  for first paint, but the workbook value wins.)
- `GET /api/exchange-rate` is **kept** — used only by the convert-all operation (and any AI
  insight that wants an approximate cross-currency figure). It is no longer used for
  routine display.

### Settings integration
- The "Currency" control (in the forthcoming Settings page; until then, wherever the
  selector currently lives) sets `base_currency` via `PATCH /api/workbook`. Changing it
  shows a confirmation note: "This converts all amounts at today's rate." On success,
  reload so every view reflects the converted, natively-formatted values.

## Components affected

Every consumer of `formatFromUsd` / the USD-input helper: `activity-tab.tsx`,
`add-transaction-dialog.tsx`, `quick-add-expense-dialog.tsx`, `budgets-tab.tsx`,
`goals-tab.tsx`, `debts-tab.tsx`, `recurring-dialog.tsx`, `charts.tsx`,
`dashboard-tab.tsx`, `dashboard/overview-hero.tsx`, `dashboard/category-health-list.tsx`,
`dashboard/spending-velocity-card.tsx`, `dashboard/ai-money-plan-cta.tsx`, and the AI
money-plan prompt. The change is broad but mechanical (format-in-base, store-as-typed).

## Non-goals

- Per-transaction / mixed currencies.
- Live FX display conversion or a read-only "view in another currency" peek.
- Changing amount column types or precision (stay `double precision`).
- Historical exchange-rate accuracy for the one-time convert-all (uses the current rate).

## Testing

- Unit: cross-rate derivation (`usdTo/usdFrom`) and per-currency rounding (ZAR 2dp,
  JPY 0dp); `parseAmount`/`formatAmount` round-trips for ZAR and JPY.
- Migration: `base_currency` column added, defaults USD, existing amounts unchanged.
- Convert-all: switching USD→ZAR multiplies every listed column by the rate, sets the flag,
  logs activity; switching back ZAR→USD restores ~original magnitudes (within rounding).
- Manual: enter R100, confirm it persists and re-displays as exactly R100 (no drift);
  totals, limits, goals, debts, recurring all format in ZAR.
- `npx tsc --noEmit`, `npm run build`, `npm run lint` (≤ baseline), `npm run test` green.

## Sequencing

Build this **before** the navigation/settings redesign
(`2026-05-27-nav-settings-redesign-design.md`). The only overlap is that the redesign's
Settings page hosts the currency control; until that ships, the currency control stays in
its current chrome location but switches to setting `base_currency`.
