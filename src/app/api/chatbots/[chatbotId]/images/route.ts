import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { validateChatbotImageUpload, CHATBOT_IMAGE_FORMATS as formats, CHATBOT_IMAGE_MAX_BYTES as maxSize } from "@/lib/chatbots/imageUploadValidation";
import { requirePreviewChatbot, ChatbotAccessError } from "@/lib/chatbots/server";
import { chatbotImagesAllowed } from "@/lib/chatbots/imagesServer";
import { createServiceRoleClient } from "@/lib/supabase-server";
import { getStorageBucket } from "@/lib/firebase-admin";
import { resolveMeteredDecisions } from "@/lib/ai/gateway";

const fields = "id,chatbot_id,description,filename,status";
type Context = { params: Promise<{ chatbotId: string }> };
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Image operation failed" },
    { status: error instanceof ChatbotAccessError ? error.status : 400 });
}

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const { bot, user } = await requirePreviewChatbot((await params).chatbotId);
    const allowed = await chatbotImagesAllowed(bot.class_id);
    const { data, error } = await createServiceRoleClient().from("chatbot_images").select(fields)
      .eq("chatbot_id", bot.id).eq("status", "ready").order("created_at");
    if (error) throw error;
    let configurationError: string | null = null;
    if (allowed) {
      try { await resolveMeteredDecisions({ classDbId: bot.class_id, userId: user.id }); }
      catch { configurationError = "Image matching is unavailable. Ask an administrator to check Decisions → Chatbot image matching, OpenAI credentials, and the class AI allowance."; }
    }
    return NextResponse.json({ images: data, allowed, configurationError }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) throw new ChatbotAccessError("Invalid request origin", 403);
    const { bot, user } = await requirePreviewChatbot((await params).chatbotId);
    if (!await chatbotImagesAllowed(bot.class_id)) throw new ChatbotAccessError("Uploaded chatbot images are disabled for this class", 403);
    const body = await request.json();
    const service = createServiceRoleClient();
    const bucket = getStorageBucket();
    const manage = async (action: string, data: Record<string, unknown>) => {
      const result = await service.rpc("manage_chatbot_image", { p_bot_id: bot.id, p_actor_id: user.id, p_action: action, p_data: data });
      if (result.error) throw new Error(result.error.message);
      return result.data;
    };
    // Expired staging objects are never referenced by transcripts. Retry cleanup on each write.
    const { data: expired } = await service.from("chatbot_images").select("id,storage_path").eq("chatbot_id", bot.id)
      .in("status", ["pending", "removed"]).like("storage_path", "chatbot-images/staging/%").lt("created_at", new Date(Date.now() - 20 * 60_000).toISOString());
    for (const row of expired ?? []) {
      await bucket.file(row.storage_path).delete({ ignoreNotFound: true });
      await service.from("chatbot_images").delete().eq("id", row.id).in("status", ["pending", "removed"]);
    }
    if (body.action === "request") {
      if (typeof body.description !== "string" || !body.description.trim() || body.description.length > 2000 ||
        typeof body.filename !== "string" || !body.filename || body.filename.length > 255 ||
        !Object.hasOwn(formats, body.mime_type) || !Number.isInteger(body.file_size) || body.file_size < 1 || body.file_size > maxSize)
        throw new Error("Choose a PNG, JPEG or WebP up to 10 MB and enter a description (maximum 2000 characters).");
      const id = randomUUID();
      const path = `chatbot-images/staging/${bot.id}/${id}`;
      await manage("request", { ...body, id, storage_path: path });
      try {
        const [uploadUrl] = await bucket.file(path).getSignedUrl({ version: "v4", action: "write", expires: Date.now() + 15 * 60_000, contentType: body.mime_type });
        return NextResponse.json({ id, uploadUrl });
      } catch (error) {
        await service.from("chatbot_images").delete().eq("id", id).eq("status", "pending");
        throw error;
      }
    }
    if (typeof body.id !== "string") throw new Error("Image ID required");
    const { data: image, error } = await service.from("chatbot_images").select("*").eq("id", body.id).eq("chatbot_id", bot.id).single();
    if (error || !image) throw new Error("Image not found");
    if (body.action === "confirm") {
      if (image.status === "ready") return NextResponse.json({ ok: true });
      if (image.status !== "pending") throw new Error("Upload unavailable");
      const staging = bucket.file(image.storage_path);
      const immutablePath = `chatbot-images/assets/${bot.id}/${image.id}/${randomUUID()}`;
      const destination = bucket.file(immutablePath);
      try {
        const [metadata] = await staging.getMetadata();
        if (Number(metadata.size) > maxSize || Number(metadata.size) !== image.file_size) throw new Error("Uploaded file size does not match");
        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const chunk of staging.createReadStream()) {
          bytes += chunk.length;
          if (bytes > maxSize) throw new Error("Image exceeds 10 MB");
          chunks.push(Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);
        const validated = await validateChatbotImageUpload(buffer, image.mime_type);
        await destination.save(validated, { resumable: false, metadata: { contentType: image.mime_type } });
        await manage("confirm", { id: image.id, storage_path: immutablePath, file_size: validated.length });
        await staging.delete({ ignoreNotFound: true });
        return NextResponse.json({ ok: true });
      } catch (error) {
        // Never delete an asset that a concurrent successful confirmation committed.
        const { data: current } = await service.from("chatbot_images").select("storage_path,status").eq("id", image.id).single();
        if (current?.storage_path !== immutablePath) await destination.delete({ ignoreNotFound: true });
        if (current?.status === "pending") {
          await staging.delete({ ignoreNotFound: true });
          await service.from("chatbot_images").delete().eq("id", image.id).eq("status", "pending");
        }
        throw error;
      }
    }
    if (body.action === "edit" || body.action === "remove") {
      await manage(body.action, { id: image.id, description: body.description });
      if (body.action === "remove" && image.status === "pending") await bucket.file(image.storage_path).delete({ ignoreNotFound: true });
      return NextResponse.json({ ok: true });
    }
    throw new Error("Unknown image operation");
  } catch (error) { return failure(error); }
}
