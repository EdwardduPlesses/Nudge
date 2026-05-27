import { NextResponse } from "next/server";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../../_shared/workbook-mutation";
import { setInviteStatus } from "@/lib/budget/sharing";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const ctx = await resolveMutationContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.inviteId || (body.action !== "decline" && body.action !== "revoke")) {
    return NextResponse.json({ error: "inviteId + action(decline|revoke) required" }, { status: 400 });
  }
  await setInviteStatus(body.inviteId, body.action === "decline" ? "declined" : "revoked");
  return NextResponse.json({ ok: true });
}
