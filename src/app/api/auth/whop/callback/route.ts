import { NextResponse } from "next/server";
import { exchangeWhopOAuthCode, fetchWhopUserId, getWhopOAuthRedirectUri } from "@/lib/auth/whop-oauth";
import { userHasAnyNudgeMembership } from "@/lib/auth/standalone-gate";
import {
  NUDGE_OAUTH_STATE_COOKIE,
  NUDGE_SESSION_COOKIE,
  decodeOAuthState,
  encodeNudgeSession,
} from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function errorPage(message: string, status = 400): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Sign-in error</title></head><body style="font-family:system-ui;max-width:520px;margin:5rem auto;padding:0 1rem;text-align:center"><h1>Couldn't sign you in</h1><p>${message}</p><p><a href="/login">Try again</a></p></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");

  const stateCookie = req.headers
    .get("cookie")
    ?.match(new RegExp(`${NUDGE_OAUTH_STATE_COOKIE}=([^;]+)`))?.[1];
  if (!code || !stateParam || !stateCookie) return errorPage("Missing OAuth parameters.");

  const claims = decodeOAuthState(stateCookie);
  if (!claims || claims.state !== stateParam) {
    return errorPage("OAuth state mismatch. Please try again.");
  }

  let userId: string;
  try {
    const token = await exchangeWhopOAuthCode({
      code,
      codeVerifier: claims.verifier,
      redirectUri: getWhopOAuthRedirectUri(),
    });
    userId = await fetchWhopUserId(token.access_token);
  } catch (err) {
    console.error("[Nudge] OAuth token exchange failed", err);
    return errorPage("We couldn't reach Whop to verify your sign-in. Try again in a moment.", 502);
  }

  const allowed = await userHasAnyNudgeMembership(userId);
  if (!allowed) {
    return errorPage(
      "You need an active Nudge membership in a Whop community to use the standalone app. Open Nudge from your community once, then try signing in here.",
      403,
    );
  }

  // Upsert nudge_profiles so subsequent budget operations don't fail on the FK.
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("nudge_profiles")
      .upsert({ whop_user_id: userId }, { onConflict: "whop_user_id" });
    if (error) throw error;
  } catch (err) {
    console.error("[Nudge] profile upsert during OAuth callback failed", err);
    return errorPage("We signed you in but couldn't initialize your account. Try again.", 500);
  }

  const sessionToken = encodeNudgeSession({
    sub: userId,
    gate_checked_at: Math.floor(Date.now() / 1000),
  });
  const res = NextResponse.redirect(new URL(claims.next, url.origin), { status: 302 });
  res.cookies.set(NUDGE_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 3600,
  });
  res.cookies.set(NUDGE_OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
