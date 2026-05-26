# Nudge — standalone app mode (alongside Whop iframe)

Status: design draft
Date: 2026-05-26

## Goal

Let users access Nudge two ways:

1. **Whop iframe** (existing) — `/experiences/[experienceId]`, identity from the `x-whop-user-token` header, per-experience access check.
2. **Standalone web URL** (new) — `/app`, identity from a session cookie set after Whop OAuth sign-in.

The same user sees the same data in both modes. Whop OAuth is the only auth — there is no email/password.

## Non-goals

- Email/password or non-Whop auth.
- Multiple workbooks per user (per-experience separation goes away).
- Session management UI (revocation, device list).
- Marketing/landing page redesign — `/` stays as it is.

## Identity model

- `whop_user_id` is the single user identifier in both modes.
- One `nudge_workbooks` row per user (no `experience_id` in the key).
- A new resolver, `getCurrentUserId(headers)`, is the only way server code obtains the user. Precedence:
  1. `x-whop-user-token` header present → `whopsdk.verifyUserToken` (Whop iframe).
  2. `nudge_session` cookie present and valid → use its `sub`.
  3. In dev with `NUDGE_STRICT_WHOP != "1"` → `NUDGE_DEV_PREVIEW_USER_ID` (existing behavior preserved).
  4. Otherwise `null`.

No route should call `whopsdk.verifyUserToken` directly anymore — everything goes through `getCurrentUserId`.

## Routes

| Route | Purpose | Auth |
|---|---|---|
| `/` | Marketing (unchanged) | None |
| `/login` | "Continue with Whop" button | None |
| `/app` | Standalone app shell | Session cookie required; else redirect to `/login?next=/app` |
| `/experiences/[experienceId]` | Whop iframe entry (unchanged externally) | Whop iframe token; runs `checkAccess` for that experience |
| `/api/auth/whop/start` | Begin OAuth | None |
| `/api/auth/whop/callback` | Exchange code, run gate, set session | None |
| `/api/auth/logout` | Clear session | Session cookie |
| `/api/budget-state` | GET/PUT workbook | `getCurrentUserId`; no `experienceId` query param anymore |
| `/api/exchange-rate` | (unchanged) | None |

`/app/page.tsx` and `/experiences/[experienceId]/page.tsx` render the **same** `NudgeBudgetProvider` + `CurrencyPreferenceProvider` + `NudgeApp` tree. Only the auth/access checks differ. `CurrencyPreferenceProvider` continues to scope display-currency preference by `experienceId` (localStorage) — for standalone we pass a stable synthetic `experienceId` of `"standalone"`.

## Whop OAuth flow

1. Browser hits `/api/auth/whop/start?next=/app`.
2. Server generates random `state`, stores `{ state, next }` in short-lived (~10 min) signed httpOnly cookie `nudge_oauth_state`, 302s to Whop's authorize URL with `client_id`, `redirect_uri`, `state`, `scope`.
3. User approves on Whop → Whop redirects to `/api/auth/whop/callback?code=...&state=...`.
4. Callback:
   - Validates `state` matches the cookie; clears the cookie.
   - Exchanges `code` for an access token via Whop's token endpoint.
   - Fetches the user profile → `whop_user_id`.
   - Runs the standalone access gate (below). If it fails, render an access-denied page; do not issue a session.
   - Upserts a `nudge_profiles` row.
   - Issues the session cookie; 302s to `next` (default `/app`).

**Implementation note:** the exact OAuth endpoints, scopes, and helpers must be confirmed against `@whop/sdk` / `@whop/react` in `node_modules/` at implementation time. The SDK likely provides helpers; the plan must read the in-repo docs before writing the callback.

**Env additions:**

| Var | Role |
|---|---|
| `WHOP_APP_CLIENT_SECRET` | OAuth code exchange (server only). Confirm exact name from SDK. |
| `WHOP_OAUTH_REDIRECT_URI` | Full URL of `/api/auth/whop/callback`. |
| `NUDGE_SESSION_SECRET` | HS256 signing secret for session JWT and `nudge_oauth_state` cookie. |
| `NUDGE_APP_BASE_URL` | Used to build absolute redirect URIs. |

## Session

- Cookie name: `nudge_session`.
- Value: signed JWT (HS256) with claims `{ sub: whop_user_id, iat, exp, gate_checked_at }`.
- Lifetime: 30 days, sliding (re-issued on each authenticated request when the existing token is > 24h old).
- Flags: `httpOnly`, `Secure` (prod), `SameSite=Lax`. Lax is required so the OAuth callback redirect can read the cookie.
- The Whop iframe path **never** uses this cookie — it relies on the `x-whop-user-token` header as today.

## Standalone access gate

Standalone access requires the user to be an active member of at least one Whop experience that has Nudge installed.

- Runs once in the OAuth callback before issuing the session.
- Re-runs on each `/app` page load if `gate_checked_at` is older than 15 minutes; on re-check failure, clear the session and redirect to `/login`.
- Implementation: query the Whop API for the user's memberships/accessible experiences for this app. The SDK surface (`whopsdk.users.listMemberships`, `whopsdk.experiences.listForUser`, or similar) must be confirmed at implementation time — the plan reads `node_modules/@whop/sdk` docs first.
- The Whop iframe path does **not** call this gate; it keeps the existing per-experience `checkAccess` (which is strictly tighter for that surface).

## Schema migration

Single SQL file: `supabase/migrations/<timestamp>_nudge_workbook_per_user.sql`.

Steps:

1. **Dedupe**: for each `whop_user_id` with multiple workbooks, keep the row with the latest `updated_at`; delete the others. Children (`nudge_categories`, `nudge_transactions`, `nudge_goals`) cascade.
2. `ALTER TABLE public.nudge_workbooks DROP CONSTRAINT nudge_workbooks_experience_id_whop_user_id_key;` (the actual constraint name in Supabase must be confirmed; it's the `unique (experience_id, whop_user_id)` from the original migration.)
3. `ALTER TABLE public.nudge_workbooks DROP COLUMN experience_id;`
4. `DROP INDEX IF EXISTS public.nudge_workbooks_exp_user_idx;`
5. `ALTER TABLE public.nudge_workbooks ADD CONSTRAINT nudge_workbooks_whop_user_id_key UNIQUE (whop_user_id);`

The migration is destructive. Take a Supabase backup before applying. There is no clean back-migration; recovery is restore-from-backup.

## Code changes (server)

- **New** `src/lib/auth/session.ts` — JWT encode/decode for `nudge_session` and `nudge_oauth_state`. Uses `NUDGE_SESSION_SECRET`.
- **New** `src/lib/auth/current-user.ts` — `getCurrentUserId(headers, cookies)` resolver described above. Replaces direct `verifyUserToken` calls in routes.
- **New** `src/lib/auth/whop-oauth.ts` — OAuth URL builders, token exchange, profile fetch. Reads `@whop/sdk` to use SDK helpers where present.
- **New** `src/lib/auth/standalone-gate.ts` — `userHasAnyNudgeMembership(userId)` against the Whop API.
- **New routes** `src/app/api/auth/whop/start/route.ts`, `.../callback/route.ts`, `src/app/api/auth/logout/route.ts`.
- **New page** `src/app/app/page.tsx` — mirrors `experiences/[experienceId]/page.tsx` minus the per-experience `checkAccess`, plus a session-cookie check, passes `experienceId="standalone"` to providers.
- **New page** `src/app/login/page.tsx` — minimal "Continue with Whop" button posting to `/api/auth/whop/start`.
- **Modify** `src/lib/budget/supabase-persistence.ts` — drop `experienceId` parameter from `fetchBudgetStateFromSupabase`, `replaceBudgetStateInSupabase`.
- **Modify** `src/app/api/budget-state/route.ts` — drop `experienceId` query param; use `getCurrentUserId`.
- **Modify** `src/app/experiences/[experienceId]/page.tsx` — load workbook by user only; pass `experienceId` only to `CurrencyPreferenceProvider`.
- **Modify** `src/context/nudge-budget-context.tsx` — drop `experienceId` from the PUT URL.
- **Modify** `src/lib/nudge-dev-preview.ts` — `resolveNudgeUserIdForBudgetApi` becomes a thin wrapper over `getCurrentUserId` (or is replaced entirely).
- **Modify** `next.config.ts` CSP — verify `frame-ancestors` still allows Whop hosts (no change expected). Add nothing for `/app` and `/login`, which aren't framed.

## Code changes (client)

Minimal. The `NudgeApp` tree is unchanged. The standalone page passes a stable `experienceId="standalone"` so `CurrencyPreferenceProvider`'s localStorage key is consistent across visits.

Add a small "Sign out" affordance in `/app` (not in the iframe) — wires to `POST /api/auth/logout`. Hidden when `experienceId !== "standalone"`.

## Error / edge cases

- **OAuth `state` mismatch** → callback returns 400 with a "Please try signing in again" page.
- **Token exchange failure** → 502 with a generic error; logs the underlying message server-side.
- **Gate fails on callback** → "You need an active Nudge membership" page with a link back to a Whop community that sells access.
- **Session cookie expired or tampered** → treat as unauthenticated; `/app` redirects to `/login`; API returns 401.
- **User is in the Whop iframe AND has a stale `nudge_session` cookie** → iframe header wins (precedence rule 1). The cookie is ignored.
- **Dev preview mode** continues to work for both surfaces when `NUDGE_STRICT_WHOP != "1"`.

## Testing

- **Migration**: seed two workbooks for one user with different `updated_at`; run migration; assert only newest survives and schema matches target.
- **`getCurrentUserId`**: unit tests for each precedence branch (iframe token, session cookie, dev fallback, none).
- **Session JWT**: round-trip encode/decode; tampered token rejected; expired token rejected.
- **OAuth callback**: state mismatch rejected; happy-path issues a session; gate-fail does not issue a session.
- **`/app`**: unauthenticated → redirect to `/login`; authenticated but gate stale-and-failing → forced logout.
- **`/experiences/[experienceId]`**: unchanged behavior (smoke test it still works after the workbook scope change).
- **End-to-end manual**: sign in standalone, add a transaction; open the Whop iframe as the same user; see the same transaction.

## Open items to resolve during implementation (not blocking spec approval)

- Confirm exact Whop OAuth endpoint URLs, scopes, and SDK helper names from `node_modules/@whop/sdk`.
- Confirm exact env var name for the OAuth client secret (the SDK may already have an expected name).
- Confirm exact Whop API call for "does this user have access to any experience that has Nudge installed."
- Confirm the exact Supabase constraint name to drop in the migration (run `\d nudge_workbooks` against a current DB).
