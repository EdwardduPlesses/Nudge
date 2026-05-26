import { createHash, randomBytes } from "node:crypto";

/**
 * Whop OAuth client. Verified against the official OAuth guide:
 * https://docs.whop.com/developer/guides/oauth
 *
 * Whop uses OAuth 2.1 + PKCE + OIDC. This app is configured as a Confidential
 * client (see the OAuth tab in the Whop dashboard), so the token exchange
 * sends both PKCE `code_verifier` AND `client_secret`.
 */

const WHOP_AUTHORIZE_URL = "https://api.whop.com/oauth/authorize";
const WHOP_TOKEN_URL = "https://api.whop.com/oauth/token";
const WHOP_USERINFO_URL = "https://api.whop.com/oauth/userinfo";
const DEFAULT_SCOPES = ["openid"];

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`${name} must be set`);
  return v.trim();
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function generatePkceVerifier(): string {
  // 32 random bytes -> 43-char base64url verifier (RFC 7636 allows 43-128 chars).
  return b64url(randomBytes(32));
}

export function pkceChallengeFromVerifier(verifier: string): string {
  return b64url(createHash("sha256").update(verifier).digest());
}

export function buildWhopAuthorizeUrl(opts: {
  state: string;
  nonce: string;
  codeChallenge: string;
  redirectUri: string;
  scopes?: string[];
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: requireEnv("NEXT_PUBLIC_WHOP_APP_ID"),
    redirect_uri: opts.redirectUri,
    scope: (opts.scopes ?? DEFAULT_SCOPES).join(" "),
    state: opts.state,
    nonce: opts.nonce,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${WHOP_AUTHORIZE_URL}?${params.toString()}`;
}

export type WhopTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
};

export async function exchangeWhopOAuthCode(opts: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<WhopTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: requireEnv("NEXT_PUBLIC_WHOP_APP_ID"),
    client_secret: requireEnv("WHOP_APP_CLIENT_SECRET"),
    code_verifier: opts.codeVerifier,
  });
  const res = await fetch(WHOP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Whop token exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as WhopTokenResponse;
}

/**
 * Fetch the authenticated user's id (OIDC `sub` claim) via /oauth/userinfo.
 */
export async function fetchWhopUserId(accessToken: string): Promise<string> {
  const res = await fetch(WHOP_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Whop /oauth/userinfo failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { sub?: string };
  if (!json.sub || typeof json.sub !== "string") {
    throw new Error("Whop /oauth/userinfo did not return a `sub` claim");
  }
  return json.sub;
}

export function getWhopOAuthRedirectUri(): string {
  return requireEnv("WHOP_OAUTH_REDIRECT_URI");
}
