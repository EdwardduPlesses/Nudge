import { NextResponse } from "next/server";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";
import { readJson } from "../_shared/validation";
import { createInvite, listIncomingInvites, listOutgoingInvites } from "@/lib/budget/sharing";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const ctx = await resolveMutationContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await readJson(req);
  if (parsed.error) return parsed.error;
  const body = parsed.body;
  const method = body.method === "username" ? "username" : "code";
  const res = await createInvite(ctx.workbookId, ctx.userId, method, body.username as string | undefined);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ invite: res.invite });
}

export async function GET() {
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const ctx = await resolveMutationContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [incoming, outgoing] = await Promise.all([
    listIncomingInvites(ctx.userId),
    listOutgoingInvites(ctx.workbookId),
  ]);
  return NextResponse.json({ incoming, outgoing });
}
