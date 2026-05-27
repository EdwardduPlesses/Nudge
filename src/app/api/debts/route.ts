import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";
import { logActivity } from "@/lib/budget/activity";

export const dynamic = "force-dynamic";

async function ctx() {
  if (!isSupabasePersistenceEnabled()) return { error: NextResponse.json({ error: "Supabase not configured" }, { status: 503 }) };
  const c = await resolveMutationContext();
  if (!c) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { c };
}

export async function GET() {
  const r = await ctx(); if (r.error) return r.error;
  const { workbookId } = r.c;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("nudge_debts")
    .select("id, name, balance, apr, min_payment, created_by")
    .eq("workbook_id", workbookId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const debts = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    balance: row.balance,
    apr: row.apr,
    minPayment: row.min_payment,
    createdBy: row.created_by,
  }));
  return NextResponse.json({ debts });
}

export async function POST(req: Request) {
  const r = await ctx(); if (r.error) return r.error;
  const { userId, workbookId } = r.c;
  const body = await req.json();
  const id = crypto.randomUUID();
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("nudge_debts").insert({
    id,
    workbook_id: workbookId,
    name: String(body.name ?? "Debt"),
    balance: Number(body.balance ?? 0),
    apr: Number(body.apr ?? 0),
    min_payment: Number(body.minPayment ?? 0),
    created_by: userId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(workbookId, userId, "created", "debt", id, `added debt ${String(body.name ?? "Debt")}`);
  return NextResponse.json({ id });
}

export async function PATCH(req: Request) {
  const r = await ctx(); if (r.error) return r.error;
  const { workbookId, userId } = r.c;
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name);
  if (body.balance !== undefined) patch.balance = Number(body.balance);
  if (body.apr !== undefined) patch.apr = Number(body.apr);
  if (body.minPayment !== undefined) patch.min_payment = Number(body.minPayment);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("nudge_debts").update(patch).eq("id", body.id).eq("workbook_id", workbookId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(workbookId, userId, "updated", "debt", body.id, "updated a debt");
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const r = await ctx(); if (r.error) return r.error;
  const { workbookId, userId } = r.c;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = getSupabaseAdmin();
  await supabase.from("nudge_transactions").update({ debt_id: null }).eq("debt_id", id).eq("workbook_id", workbookId);
  const { error } = await supabase.from("nudge_debts").delete().eq("id", id).eq("workbook_id", workbookId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(workbookId, userId, "deleted", "debt", id, "removed a debt");
  return NextResponse.json({ ok: true });
}
