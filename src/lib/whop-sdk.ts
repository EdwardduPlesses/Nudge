import { Whop } from "@whop/sdk";

function formatApiKey(key: string | undefined): string | undefined {
  if (!key?.trim()) return undefined;
  return key.startsWith("Bearer ") ? key : `Bearer ${key}`;
}

/** Use a placeholder during `next build` when env is not loaded; set WHOP_API_KEY locally and in deploy. */
const apiKeyForRuntime =
  formatApiKey(process.env.WHOP_API_KEY) ?? "Bearer __set_WHOP_API_KEY__";

export const whopsdk = new Whop({
  apiKey: apiKeyForRuntime,
  appID: process.env.NEXT_PUBLIC_WHOP_APP_ID ?? null,
});
