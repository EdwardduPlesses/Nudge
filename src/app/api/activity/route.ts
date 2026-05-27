import { NextResponse } from "next/server";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";
import { listActivity } from "@/lib/budget/activity";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const ctx = await resolveMutationContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const actor = url.searchParams.get("actor");
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 50, 200));
  const items = await listActivity(ctx.workbookId, { actorUserId: actor, limit });
  return NextResponse.json({ items });
}
