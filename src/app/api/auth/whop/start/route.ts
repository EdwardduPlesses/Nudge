import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import {
  buildWhopAuthorizeUrl,
  generatePkceVerifier,
  getWhopOAuthRedirectUri,
  pkceChallengeFromVerifier,
} from "@/lib/auth/whop-oauth";
import { NUDGE_OAUTH_STATE_COOKIE, encodeOAuthState } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const SAFE_NEXT_RE = /^\/[A-Za-z0-9/_\-?=&%.]*$/;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawNext = url.searchParams.get("next") ?? "/app";
  const next = SAFE_NEXT_RE.test(rawNext) ? rawNext : "/app";

  const state = randomBytes(24).toString("hex");
  const verifier = generatePkceVerifier();
  const codeChallenge = pkceChallengeFromVerifier(verifier);

  const cookieValue = encodeOAuthState({ state, next, verifier });
  const redirectUri = getWhopOAuthRedirectUri();
  const authorizeUrl = buildWhopAuthorizeUrl({ state, codeChallenge, redirectUri });

  const res = NextResponse.redirect(authorizeUrl, { status: 302 });
  res.cookies.set(NUDGE_OAUTH_STATE_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return res;
}
