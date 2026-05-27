import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { acceptInvite, isValidAcceptMode } from "@/lib/budget/sharing";
import { readJson } from "../../_shared/validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const [hdrs, cks] = await Promise.all([headers(), cookies()]);
  const u = await getCurrentUser(hdrs, cks);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await readJson(req);
  if (parsed.error) return parsed.error;
  const body = parsed.body;
  if (!isValidAcceptMode(body.mode)) return NextResponse.json({ error: "mode must be adopt or fresh" }, { status: 400 });
  if (!body.code && !body.inviteId) return NextResponse.json({ error: "code or inviteId required" }, { status: 400 });
  const todayIso = new Date().toISOString().slice(0, 10);
  const res = await acceptInvite(u.userId, body.mode, { code: body.code as string | undefined, id: body.inviteId as string | undefined }, todayIso);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
