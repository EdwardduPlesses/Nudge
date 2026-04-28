import { Whop } from "@whop/sdk";

/**
 * Whop's SDK always sends `Authorization: Bearer ${apiKey}`.
 * Strip a duplicate "Bearer " if the env var included it; never add Bearer here.
 */
function normalizeApiKey(key: string | undefined): string | undefined {
  if (!key?.trim()) return undefined;
  const t = key.trim();
  return t.toLowerCase().startsWith("bearer ") ? t.slice(7).trim() : t;
}

/** Placeholder only so `new Whop()` does not throw at import time during build. */
const apiKeyForRuntime =
  normalizeApiKey(process.env.WHOP_API_KEY) ?? "invalid_missing_WHOP_API_KEY";

export const whopsdk = new Whop({
  apiKey: apiKeyForRuntime,
  appID: process.env.NEXT_PUBLIC_WHOP_APP_ID ?? null,
});
