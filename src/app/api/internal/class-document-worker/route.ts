import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase-server";
import { finishDocumentProcessing } from "@/lib/classDocuments/processing";

export const runtime = "nodejs";
// Vercel builds this route too; Cloud Run enforces the actual 900-second worker timeout.
export const maxDuration = 300;

const taskSchema = z.object({
  documentId: z.string().uuid(),
  runId: z.string().uuid(),
  phase: z.literal("poll"),
});

export async function POST(request: NextRequest) {
  const expectedEmail = process.env.CLASS_DOCUMENT_TASK_INVOKER;
  const audience =
    process.env.CLASS_DOCUMENT_WORKER_AUDIENCE ||
    (process.env.CLASS_DOCUMENT_WORKER_URL
      ? new URL(process.env.CLASS_DOCUMENT_WORKER_URL).origin
      : undefined);
  if (!expectedEmail || !audience)
    return NextResponse.json(
      { error: "Worker is not configured" },
      { status: 503 },
    );
  const bearer = /^Bearer (.+)$/.exec(
    request.headers.get("authorization") || "",
  )?.[1];
  if (!bearer)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const ticket = await new OAuth2Client().verifyIdToken({
      idToken: bearer,
      audience,
    });
    const claims = ticket.getPayload();
    if (claims?.email !== expectedEmail || !claims.email_verified)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = taskSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid task" }, { status: 400 });
  const task = parsed.data;
  try {
    await finishDocumentProcessing(task.documentId, task.runId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const retries = Number(
      request.headers.get("x-cloudtasks-taskretrycount") || 0,
    );
    if (retries >= 5) {
      await createServiceRoleClient()
        .from("class_documents")
        .update({
          status: "failed",
          error_message:
            error instanceof Error ? error.message : "Conversion failed",
        })
        .eq("id", task.documentId)
        .eq("processing_run_id", task.runId)
        .eq("status", "processing");
      return NextResponse.json({ error: "Conversion failed after retries" });
    }
    console.error("[class-document-worker] Task failed", {
      phase: task.phase,
      documentId: task.documentId,
      error,
    });
    return NextResponse.json(
      { error: "Document worker failed" },
      { status: 500 },
    );
  }
}
