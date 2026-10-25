import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getStorageBucket } from "@/lib/firebase-admin";
import { resolveDocumentFigureGroup } from "@/lib/classDocuments/student";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const assignmentId = searchParams.get("assignmentId") || "";
  const submissionId = searchParams.get("submissionId") || "";
  const documentId = searchParams.get("documentId") || "";
  const figureId = searchParams.get("figureId") || "";
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(submissionId) || ![documentId, figureId].every((id) => /^[0-9a-f-]{36}$/i.test(id))) {
    return NextResponse.json({ error: "Invalid figure reference" }, { status: 400 });
  }
  const db = await createServerSupabaseClient();
  const { data: { user } } = await db.auth.getUser();
  const group = await resolveDocumentFigureGroup(assignmentId, submissionId, user?.id || null, documentId, undefined, figureId, searchParams.get("versionPath") || undefined);
  const figure = group?.figures.find((item) => item.id === figureId);
  if (!figure || !figure.storagePath.startsWith(`class-documents/${documentId}/figures/`)) {
    return NextResponse.json({ error: "Figure not found" }, { status: 404 });
  }
  const [bytes] = await getStorageBucket().file(figure.storagePath).download();
  const type = figure.storagePath.endsWith(".png") ? "image/png" : figure.storagePath.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": type, "Cache-Control": "private, max-age=300" } });
}
