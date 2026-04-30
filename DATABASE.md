# Supabase migrations — apply from this repo

Schema lives in **`supabase/migrations/`**. After new SQL files land in git, apply them with one command:

```bash
npm run db:push
```

That runs **`supabase db push`** (via `npx` so you don’t need a global install).

---

## One-time setup per machine

Do this from the **`budget-app`** directory (this repo root).

1. **Generate local Supabase config** (skip if this repo already has **`supabase/config.toml`**):

   ```bash
   npx supabase init
   ```

   Use defaults unless you use local Docker (`supabase start`); Nudge only needs remote **`db push`**.

2. **Authenticate** — run once:

   ```bash
   npx supabase login
   ```

3. **Link this repo to your hosted project** — run once (interactive; needs your DB password):

   ```bash
   npx supabase link --project-ref <YOUR_PROJECT_REF>
   ```

   **Project ref**: Supabase dashboard → **Project Settings** → **General** → Reference ID (`abcdxyz...`).

Once linked, the CLI stores local link state (often under **`supabase/.temp`** or similar). Do **not** commit secrets; keep **`.gitignore`** excluding local-only artifacts if your CLI generates them outside ignored paths.

---

## Every time migrations change

```bash
cd apps/budget-app   # or your path to this app
npm run db:push
```

The CLI compares `supabase/migrations/` against the remote migration history and applies only pending files.

---

## CI / teamwork

- Prefer running **`npm run db:push`** only from trusted environments using a **personal access token** and linked project (`SUPABASE_ACCESS_TOKEN` env for non-interactive flows—see Supabase CLI docs).

- Agents (and contributors) normally **commit SQL under `supabase/migrations/`**; a human or pipeline runs **`npm run db:push`** so database credentials stay out of the chat.
