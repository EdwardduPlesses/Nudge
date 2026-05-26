import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal HS256 JWT for first-party cookies. We do NOT use a JWT library —
 * single-issuer, single-audience, and a stable secret is all we need.
 */

export type NudgeSessionClaims = {
  sub: string;          // whop_user_id
  iat: number;          // seconds since epoch
  exp: number;          // seconds since epoch
  gate_checked_at: number; // seconds since epoch — last standalone-gate pass
};

export type NudgeOAuthStateClaims = {
  state: string;        // random CSRF token
  next: string;         // post-callback redirect path (must be same-origin)
  verifier: string;     // PKCE code_verifier
  iat: number;
  exp: number;
};

function getSecret(): Buffer {
  const s = process.env.NUDGE_SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("NUDGE_SESSION_SECRET must be set and at least 32 chars");
  }
  return Buffer.from(s, "utf8");
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(input: string): string {
  return b64url(createHmac("sha256", getSecret()).update(input).digest());
}

function encode<T extends object>(claims: T): string {
  const header = b64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64url(Buffer.from(JSON.stringify(claims)));
  const signingInput = `${header}.${payload}`;
  return `${signingInput}.${sign(signingInput)}`;
}

function decode<T>(token: string): T | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = sign(`${header}.${payload}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  try {
    const json = b64urlDecode(payload).toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function encodeNudgeSession(claims: Omit<NudgeSessionClaims, "iat" | "exp">, ttlSeconds = 30 * 24 * 3600): string {
  const iat = Math.floor(Date.now() / 1000);
  return encode<NudgeSessionClaims>({ ...claims, iat, exp: iat + ttlSeconds });
}

export function decodeNudgeSession(token: string): NudgeSessionClaims | null {
  const c = decode<NudgeSessionClaims>(token);
  if (!c) return null;
  if (typeof c.sub !== "string" || typeof c.exp !== "number") return null;
  if (c.exp <= Math.floor(Date.now() / 1000)) return null;
  return c;
}

export function encodeOAuthState(claims: Omit<NudgeOAuthStateClaims, "iat" | "exp">, ttlSeconds = 10 * 60): string {
  const iat = Math.floor(Date.now() / 1000);
  return encode<NudgeOAuthStateClaims>({ ...claims, iat, exp: iat + ttlSeconds });
}

export function decodeOAuthState(token: string): NudgeOAuthStateClaims | null {
  const c = decode<NudgeOAuthStateClaims>(token);
  if (!c) return null;
  if (typeof c.state !== "string" || typeof c.next !== "string" || typeof c.verifier !== "string") return null;
  if (c.exp <= Math.floor(Date.now() / 1000)) return null;
  return c;
}

export const NUDGE_SESSION_COOKIE = "nudge_session";
export const NUDGE_OAUTH_STATE_COOKIE = "nudge_oauth_state";
