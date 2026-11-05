import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase-server";
import { getStorageBucket } from "@/lib/firebase-admin";
import { validateChatbotImageUpload, CHATBOT_IMAGE_FORMATS, CHATBOT_IMAGE_MAX_BYTES } from "@/lib/chatbots/imageUploadValidation";
import { QuizImageError, requireQuizImageTeacher } from "@/lib/quizzes/imagesServer";
import { deleteQuizImageAsset } from "@/lib/quizzes/imageDeletion";

export const runtime = "nodejs";
type Context = { params: Promise<{ classId: string }> };

export async function GET(_request: NextRequest, context: Context) {
  try {
    const { classId } = await context.params;
    await requireQuizImageTeacher(classId);
    const service = createServiceRoleClient();
    const { data, error } = await service.from("quiz_images")
      .select("id,filename,status,quiz_image_references(quiz_id)")
      .eq("class_id", classId).in("status", ["ready", "deleting"]).order("created_at", { ascending: false });
    if (error) throw error;
    const images = (data ?? []).map(({ quiz_image_references, ...image }) => ({
      ...image, referenceCount: quiz_image_references.length,
    }));
    return NextResponse.json({ images }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: "Could not load uploaded images" }, { status: error instanceof QuizImageError ? error.status : 500 });
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) throw new QuizImageError("Invalid request origin", 403);
    const { classId } = await context.params;
    await requireQuizImageTeacher(classId);
    const { id } = await request.json();
    if (typeof id !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) throw new QuizImageError("Invalid image", 400);
    await deleteQuizImageAsset(createServiceRoleClient(), classId, id,
      path => getStorageBucket().file(path).delete({ ignoreNotFound: true }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Quiz image deletion failed", error);
    return NextResponse.json({ error: error instanceof QuizImageError ? error.message : "Could not finish deleting the image. Please retry deletion." },
      { status: error instanceof QuizImageError ? error.status : 500 });
  }
}
export async function POST(request: NextRequest, context: { params: Promise<{ classId: string }> }) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) throw new QuizImageError("Invalid request origin", 403);
    const { classId } = await context.params;
    const { user } = await requireQuizImageTeacher(classId);
    const body = await request.json();
    const service = createServiceRoleClient();
    const bucket = getStorageBucket();
    // Signed URLs expire after 15 minutes; allow an extra five minutes for in-flight uploads.
    const { data: expired, error: cleanupError } = await service.from("quiz_images").select("id,storage_path")
      .eq("class_id", classId).eq("status", "pending").lt("created_at", new Date(Date.now() - 20 * 60_000).toISOString());
    if (cleanupError) throw cleanupError;
    for (const row of expired ?? []) {
      await bucket.file(row.storage_path).delete({ ignoreNotFound: true });
      const { error } = await service.from("quiz_images").delete().eq("id", row.id).eq("status", "pending");
      if (error) throw error;
    }
    if (body.action === "request") {
      if (typeof body.filename !== "string" || !body.filename || body.filename.length > 255 ||
        typeof body.mime_type !== "string" || !Object.hasOwn(CHATBOT_IMAGE_FORMATS, body.mime_type) ||
        !Number.isInteger(body.file_size) || body.file_size < 1 || body.file_size > CHATBOT_IMAGE_MAX_BYTES)
        throw new QuizImageError("Choose a PNG, JPEG or WebP up to 10 MB", 400);
      const id = randomUUID();
      const storagePath = `quiz-images/staging/${classId}/${id}`;
      const { error } = await service.from("quiz_images").insert({ id, class_id: classId, created_by: user.id,
        filename: body.filename, mime_type: body.mime_type, file_size: body.file_size, storage_path: storagePath });
      if (error) throw error;
      try {
        const [uploadUrl] = await bucket.file(storagePath).getSignedUrl({ version: "v4", action: "write", expires: Date.now() + 15 * 60_000, contentType: body.mime_type });
        return NextResponse.json({ id, uploadUrl });
      } catch (error) {
        await service.from("quiz_images").delete().eq("id", id).eq("status", "pending");
        throw error;
      }
    }
    if (body.action !== "confirm" || typeof body.id !== "string") throw new QuizImageError("Invalid upload operation", 400);
    const { data: image } = await service.from("quiz_images").select("*").eq("id", body.id).eq("class_id", classId).eq("created_by", user.id).maybeSingle();
    if (!image) throw new QuizImageError("Upload expired. Please upload the image again.", 404);
    const url = `/api/quizzes/images/${image.id}`;
    if (image.status === "ready") return NextResponse.json({ url });
    if (image.status !== "pending") throw new QuizImageError("This image is being deleted. Upload it again if needed.", 409);
    if (Date.parse(image.created_at) < Date.now() - 19 * 60_000) throw new QuizImageError("Upload expired. Please try again.", 400);
    const staging = bucket.file(image.storage_path);
    const destination = bucket.file(`quiz-images/assets/${classId}/${image.id}/${randomUUID()}`);
    try {
      const [metadata] = await staging.getMetadata();
      if (Number(metadata.size) !== image.file_size) throw new QuizImageError("Uploaded size does not match", 400);
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of staging.createReadStream()) {
        size += chunk.length;
        if (size > CHATBOT_IMAGE_MAX_BYTES) throw new QuizImageError("Image exceeds 10 MB", 400);
        chunks.push(Buffer.from(chunk));
      }
      const bytes = await validateChatbotImageUpload(Buffer.concat(chunks), image.mime_type);
      await destination.save(bytes, { resumable: false, metadata: { contentType: image.mime_type } });
      const { data: updated, error } = await service.from("quiz_images").update({ storage_path: destination.name, status: "ready", file_size: bytes.length })
        .eq("id", image.id).eq("status", "pending").select("id").maybeSingle();
      if (error) throw error;
      if (!updated) {
        await destination.delete({ ignoreNotFound: true });
        const { data: winner } = await service.from("quiz_images").select("status").eq("id", image.id).maybeSingle();
        if (winner?.status !== "ready") throw new QuizImageError("Upload expired. Please try again.", 400);
      }
      await staging.delete({ ignoreNotFound: true });
      return NextResponse.json({ url });
    } catch (error) {
      const { data: current } = await service.from("quiz_images").select("status,storage_path").eq("id", image.id).maybeSingle();
      if (current && current.storage_path !== destination.name) await destination.delete({ ignoreNotFound: true });
      if (current?.status === "ready") return NextResponse.json({ url });
      throw error;
    }
  } catch (error) {
    console.error("Quiz image upload failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Image upload failed" },
      { status: error instanceof QuizImageError ? error.status : 400 });
  }
}
