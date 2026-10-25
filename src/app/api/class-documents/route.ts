import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { teacherClient } from "@/lib/classDocuments/auth";
import { getStorageBucket } from "@/lib/firebase-admin";
import { createServiceRoleClient } from "@/lib/supabase-server";

const MAX_BYTES = 20 * 1024 * 1024;

export async function GET(request: NextRequest) {
  const classId = request.nextUrl.searchParams.get("classId") || "";
  const access = await teacherClient(classId);
  if (!access) return NextResponse.json({ error: "Class not found" }, { status: 404 });
  let query = access.db.from("class_documents")
    .select("id, class_id, title, filename, file_size, page_count, tags, status, error_message, created_at, updated_at")
    .eq("class_id", classId);
  const search = request.nextUrl.searchParams.get("q")?.trim();
  if (search) query = query.textSearch("metadata_search", search, { type: "plain" });
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { classId?: string; filename?: string; fileSize?: number };
    const access = await teacherClient(body.classId || "");
    if (!access) return NextResponse.json({ error: "Class not found" }, { status: 404 });
    if (!body.filename?.toLowerCase().endsWith(".pdf") || !Number.isInteger(body.fileSize) || !body.fileSize || body.fileSize > MAX_BYTES) {
      return NextResponse.json({ error: "Select a PDF of 20 MB or less" }, { status: 400 });
    }
    const id = randomUUID();
    const path = `class-documents/${id}/original.pdf`;
    const db = createServiceRoleClient();
    const { data, error } = await db.from("class_documents").insert({
      id, class_id: body.classId, title: body.filename.replace(/\.pdf$/i, ""), filename: body.filename,
      file_size: body.fileSize, original_path: path, created_by: access.user.id,
    }).select("id").single();
    if (error || !data) throw error || new Error("Could not create document");
    try {
      const [signedUrl] = await getStorageBucket().file(path).getSignedUrl({ version: "v4", action: "write", expires: Date.now() + 15 * 60 * 1000, contentType: "application/pdf" });
      return NextResponse.json({ id, signedUrl });
    } catch (error) {
      await db.from("class_documents").delete().eq("id", id);
      throw error;
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload setup failed" }, { status: 500 });
  }
}
