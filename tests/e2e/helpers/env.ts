import { loadEnvConfig } from "@next/env";

/**
 * Load `.env.local` (and friends) into `process.env` for the Playwright test
 * process. Next loads these automatically for the dev server, but the test
 * runner is a separate process and needs the Supabase service-role creds for
 * the DB reset/seed helpers. Idempotent — safe to call from multiple modules.
 */
let loaded = false;
export function loadTestEnv(): void {
  if (loaded) return;
  loadEnvConfig(process.cwd(), true);
  loaded = true;
}
