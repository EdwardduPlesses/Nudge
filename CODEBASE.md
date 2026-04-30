# Nudge — codebase summary

**Nudge** is a Whop **embedded app** (“app view”) for personal budgeting: income plan, category limits, transactions, and savings goals—without bank connections. Internal package name: `nudge`.

---

## Stack

| Layer | Choice |
|--------|--------|
| Framework | **Next.js 16** (App Router, Turbopack in dev) |
| UI | **React 19**, **Tailwind CSS 4**, **frosted-ui** |
| Charts | **recharts** |
| Dates | **date-fns** |
| Platform SDK | **@whop/sdk**, **@whop/react** (including `withWhopAppConfig` in `next.config.ts`) |
| Budget persistence | **Supabase** (PostgreSQL; service role on the server only; required for `/experiences/*`) |

Local dev often runs **`npm run dev`**, which starts **`whop-proxy`** in front of **`next dev`** (proxy port **3001**).

---

## Repository layout

```text
src/
  app/
    page.tsx                    # Marketing/landing; in dev redirects to /experiences/dev unless NUDGE_DEV_LANDING=1
    layout.tsx
    assets/                     # e.g. app logo
    experiences/[experienceId]/ # Main app shell: Whop access gate + providers
    api/
      exchange-rate/route.ts    # USD → ZAR, EUR, GBP, JPY (Frankfurter API + fallbacks)
      budget-state/route.ts     # GET/PUT budget JSON when Supabase is configured
  components/nudge/             # Tabs: dashboard, budgets, activity, goals; charts; dialogs
  context/
    nudge-budget-context.tsx   # Budget state in memory; debounced PUT to Supabase
    currency-context.tsx       # Display currency preference (per experience + user key)
  lib/
    whop-sdk.ts                 # Whop API client (env: WHOP_API_KEY, NEXT_PUBLIC_WHOP_APP_ID)
    nudge-dev-preview.ts        # dev_local_user + NUDGE_STRICT_WHOP helper
    supabase/                   # isSupabasePersistenceEnabled, admin client
    budget/                     # types, defaults, selectors, parse/validate, Supabase repo
    currency-config.ts, format-*.ts
supabase/migrations/            # SQL for Postgres schema — apply with `npm run db:push` (see DATABASE.md)
```

---

## User flow and routing

1. **Whop** loads the app inside an iframe; the main entry for real usage is **`/experiences/[experienceId]`**.
2. The experience **server component**:
   - Verifies the user with **`whopsdk.verifyUserToken`**.
   - Calls **`whopsdk.users.checkAccess`** for the experience (skipped in dev preview mode).
   - Loads initial budget from **Supabase** (required env; otherwise a configuration screen is shown).
3. **`NudgeBudgetProvider`** + **`CurrencyPreferenceProvider`** wrap **`NudgeApp`** (client tabs and chrome).

---

## Data model (app)

Defined in **`src/lib/budget/types.ts`**:

- **`BudgetState`**: `incomePlan`, `categories[]`, `transactions[]`, `goals[]`.
- **Categories**: monthly limit in **USD** (app base); **currency context** converts for display.
- **Transactions**: income/expense, optional category, note, ISO date string.

**Budget state** is loaded on the server from **Supabase** and updated via **`PUT /api/budget-state`**—not stored in the browser for the workbook payload. **`CurrencyPreferenceProvider`** still caches display currency / FX helpers in **`localStorage`** (`src/context/currency-context.tsx`).

---

## Supabase (required for budget data)

- **Required** for the experience app: **`NEXT_PUBLIC_SUPABASE_URL`** and **`SUPABASE_SERVICE_ROLE_KEY`** (`src/lib/supabase/config.ts`). Without them, **`/experiences/[experienceId]`** shows a configuration message.
- **Schema**: `nudge_profiles`, `nudge_workbooks` (per Whop user + experience), `nudge_categories`, `nudge_transactions`, `nudge_goals` — **`supabase/migrations/`**.
- **Apply migrations**: **`npm run db:push`** after **`npx supabase link`** — [**`DATABASE.md`**](DATABASE.md).
- **Client**: budget lives in React state and syncs with **`PUT /api/budget-state`**; no **`localStorage`** for the workbook.
- **RLS** is on with **no policies** for `anon`/`authenticated`; only the **service role** (server) is intended to access tables.
- **API**: **`/api/budget-state`**: GET (read) / PUT (replace full state). Same Whop verification rules as the page; in **development**, missing auth can fall back to **`dev_local_user`** unless **`NUDGE_STRICT_WHOP=1`**.

---

## Security and embedding

- **CSP** `frame-ancestors` whitelists Whop hosts (`next.config.ts`).
- **Secrets**: never expose `SUPABASE_SERVICE_ROLE_KEY` or `WHOP_API_KEY` to the client; only `NEXT_PUBLIC_*` is browser-safe.

---

## Environment variables (reference)

| Variable | Role |
|----------|------|
| `WHOP_API_KEY` | Whop server API key |
| `NEXT_PUBLIC_WHOP_APP_ID` | Whop app id |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (required for budget app) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase key (required for budget app) |
| `NUDGE_STRICT_WHOP` | Set to `1` to disable dev preview user and stricter local gates |
| `NUDGE_DEV_LANDING` | Set to `1` in dev to show `/` instead of redirecting to `/experiences/dev` |

Copy **`.env.example`** into **`.env.local`** and fill in values.

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Whop dev proxy + Next dev (Turbopack) |
| `npm run dev:next` | Next only (no proxy) |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` | ESLint |
| `npm run db:push` | Push **`supabase/migrations/`** to linked Supabase project ([**`DATABASE.md`**](DATABASE.md)) |
| `npm run db:login` | Opens Supabase CLI login (needed once before **`db:push`** on new machines) |

---

## Agent / contributor notes

- **`AGENTS.md`** / **`CLAUDE.md`** point to Next.js in-repo docs under `node_modules/next/dist/docs/` (this repo may use Next APIs that differ from older tutorials).
- Prefer **codebase** paths above when navigating; duplicate path spellings under `src` on disk are normalized by tooling to the same modules.
- After changing Postgres schema for Nudge: add **`supabase/migrations/<timestamp>_*.sql`**, then **`npm run db:push`** (see [**`DATABASE.md`**](DATABASE.md)).
