import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";
import { readJson, boundedString } from "../_shared/validation";
import { logActivity } from "@/lib/budget/activity";

export const dynamic = "force-dynamic";

async function ctx() {
  if (!isSupabasePersistenceEnabled()) return { error: NextResponse.json({ error: "Supabase not configured" }, { status: 503 }) };
  const c = await resolveMutationContext();
  if (!c) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { c };
}

export async function POST(req: Request) {
  const r = await ctx(); if (r.error) return r.error;
  const { userId, workbookId } = r.c;
  const parsed = await readJson(req);
  if (parsed.error) return parsed.error;
  const body = parsed.body;
  const id = (body.id as string | undefined) ?? crypto.randomUUID();
  const supabase = getSupabaseAdmin();
  const name = boundedString(body.name, 120, "Untitled");
  const { error } = await supabase.from("nudge_categories").insert({
    id, workbook_id: workbookId, name,
    color: boundedString(body.color, 32, "#94a3b8"), created_by: userId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(workbookId, userId, "created", "category", id, `added category ${name}`);
  return NextResponse.json({ id });
}

export async function PATCH(req: Request) {
  const r = await ctx(); if (r.error) return r.error;
  const { workbookId, userId } = r.c;
  const parsed = await readJson(req);
  if (parsed.error) return parsed.error;
  const body = parsed.body;
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const id = String(body.id);
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = boundedString(body.name, 120, "Untitled");
  if (body.color !== undefined) patch.color = boundedString(body.color, 32, "#94a3b8");
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("nudge_categories").update(patch).eq("id", id).eq("workbook_id", workbookId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(workbookId, userId, "updated", "category", id, "renamed a category");
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const r = await ctx(); if (r.error) return r.error;
  const { workbookId, userId } = r.c;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("nudge_categories").delete().eq("id", id).eq("workbook_id", workbookId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(workbookId, userId, "deleted", "category", id, "removed a category");
  return NextResponse.json({ ok: true });
}
