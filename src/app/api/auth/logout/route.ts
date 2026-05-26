import { NextResponse } from "next/server";
import { NUDGE_SESSION_COOKIE } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const res = NextResponse.redirect(new URL("/", url.origin), { status: 303 });
  res.cookies.set(NUDGE_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
