import { NextResponse } from "next/server";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../../_shared/workbook-mutation";
import { readJson } from "../../_shared/validation";
import { respondToInvite } from "@/lib/budget/sharing";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const ctx = await resolveMutationContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await readJson(req);
  if (parsed.error) return parsed.error;
  const body = parsed.body;
  const action = body.action;
  if (!body.inviteId || (action !== "decline" && action !== "revoke")) {
    return NextResponse.json({ error: "inviteId + action(decline|revoke) required" }, { status: 400 });
  }
  const result = await respondToInvite(String(body.inviteId), action, { userId: ctx.userId, workbookId: ctx.workbookId });
  if (!result.ok) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
