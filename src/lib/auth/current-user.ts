import type { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { whopsdk } from "@/lib/whop-sdk";
import { NUDGE_DEV_PREVIEW_USER_ID, devStrictWhop } from "@/lib/nudge-dev-preview";
import { NUDGE_SESSION_COOKIE, decodeNudgeSession } from "@/lib/auth/session";

export type CurrentUser =
  | { userId: string; source: "whop-iframe" }
  | { userId: string; source: "standalone-session"; gateCheckedAt: number }
  | { userId: string; source: "dev-preview" }
  | null;

/**
 * Resolve the current user across both surfaces. Order of precedence:
 *   1. x-whop-user-token (Whop iframe) → verifyUserToken.
 *   2. nudge_session cookie → HS256 verify.
 *   3. Dev preview fallback (NODE_ENV=development and NUDGE_STRICT_WHOP != "1").
 */
export async function getCurrentUser(
  headers: ReadonlyHeaders | Headers,
  cookies: ReadonlyRequestCookies | { get: (n: string) => { value: string } | undefined },
): Promise<CurrentUser> {
  const iframeToken = headers.get("x-whop-user-token");
  if (iframeToken) {
    const auth = await whopsdk.verifyUserToken(headers as Headers, { dontThrow: true });
    if (auth?.userId) return { userId: auth.userId, source: "whop-iframe" };
  }

  const sessionCookie = cookies.get(NUDGE_SESSION_COOKIE)?.value;
  if (sessionCookie) {
    const claims = decodeNudgeSession(sessionCookie);
    if (claims) {
      return {
        userId: claims.sub,
        source: "standalone-session",
        gateCheckedAt: claims.gate_checked_at,
      };
    }
  }

  if (process.env.NODE_ENV === "development" && !devStrictWhop()) {
    return { userId: NUDGE_DEV_PREVIEW_USER_ID, source: "dev-preview" };
  }

  return null;
}
