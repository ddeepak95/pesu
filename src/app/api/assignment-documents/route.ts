import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

async function assignmentAccess(id: string) {
  const db = await createServerSupabaseClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data: assignment } = await db.from("assignments").select("id, class_id").eq("id", id).maybeSingle();
  if (!assignment) return null;
  const { data: member } = await db.from("class_teachers").select("class_id").eq("class_id", assignment.class_id).eq("teacher_id", user.id).maybeSingle();
  return member ? { db, assignment } : null;
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("assignmentId") || "";
  const access = await assignmentAccess(id);
  if (!access) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  const { data, error } = await access.db.from("assignment_documents").select("document_id").eq("assignment_id", id).order("position");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documentIds: (data || []).map((row) => row.document_id) });
}

export async function PUT(request: NextRequest) {
  const body = await request.json() as { assignmentId?: string; documentIds?: string[] };
  const access = await assignmentAccess(body.assignmentId || "");
  if (!access) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  if (!Array.isArray(body.documentIds) || body.documentIds.length > 20 || body.documentIds.some((id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))) {
    return NextResponse.json({ error: "Invalid document selection" }, { status: 400 });
  }
  const { error } = await access.db.rpc("replace_assignment_documents", { p_assignment_id: body.assignmentId, p_document_ids: body.documentIds });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
