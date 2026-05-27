import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";

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
  const body = await req.json();
  const id = body.id ?? crypto.randomUUID();
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("nudge_categories").insert({
    id, workbook_id: workbookId, name: String(body.name ?? "Untitled"),
    color: String(body.color ?? "#94a3b8"), created_by: userId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id });
}

export async function PATCH(req: Request) {
  const r = await ctx(); if (r.error) return r.error;
  const { workbookId } = r.c;
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name);
  if (body.color !== undefined) patch.color = String(body.color);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("nudge_categories").update(patch).eq("id", body.id).eq("workbook_id", workbookId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const r = await ctx(); if (r.error) return r.error;
  const { workbookId } = r.c;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("nudge_categories").delete().eq("id", id).eq("workbook_id", workbookId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
