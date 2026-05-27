import { NextResponse } from "next/server";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../../_shared/workbook-mutation";
import { respondToInvite } from "@/lib/budget/sharing";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const ctx = await resolveMutationContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.inviteId || (body.action !== "decline" && body.action !== "revoke")) {
    return NextResponse.json({ error: "inviteId + action(decline|revoke) required" }, { status: 400 });
  }
  const result = await respondToInvite(body.inviteId, body.action, { userId: ctx.userId, workbookId: ctx.workbookId });
  if (!result.ok) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
