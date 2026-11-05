import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";
import { requirePreviewChatbot } from "@/lib/chatbots/server";
import { getPublicChatbot, getPublicChatbotParticipant } from "@/lib/chatbots/publicServer";
import { getStorageBucket } from "@/lib/firebase-admin";

export async function GET(request: NextRequest, { params }: { params: Promise<{ imageId: string }> }) {
  try {
    const { imageId } = await params;
    const service = createServiceRoleClient();
    const { data: image } = await service.from("chatbot_images").select("*").eq("id", imageId).in("status", ["ready", "removed"]).maybeSingle();
    if (!image) throw new Error("Unavailable");
    const shortId = request.nextUrl.searchParams.get("chatbotId");
    const messageId = request.nextUrl.searchParams.get("messageId");
    if (shortId) {
      const { bot } = await requirePreviewChatbot(shortId);
      if (bot.id !== image.chatbot_id) throw new Error("Unavailable");
    } else if (messageId) {
      const { data: message } = await service.from("chatbot_messages").select("conversation_id,image_mappings").eq("id", messageId).maybeSingle();
      if (!message || !Array.isArray(message.image_mappings) || !message.image_mappings.some(m => m.image_id === image.id)) throw new Error("Unavailable");
      const { data: conversation } = await service.from("chatbot_conversations").select("*").eq("id", message.conversation_id).eq("chatbot_id", image.chatbot_id).maybeSingle();
      if (!conversation) throw new Error("Unavailable");
      // Signed-in access uses the same RLS as transcript review (including preview ownership).
      const client = await createServerSupabaseClient();
      const { data: visible } = await client.from("chatbot_messages").select("id").eq("id", messageId).maybeSingle();
      if (!visible) {
        if (conversation.is_preview || !conversation.public_participant_id) throw new Error("Unavailable");
        const { data: bot } = await service.from("chatbots").select("chatbot_id").eq("id", image.chatbot_id).single();
        if (!bot) throw new Error("Unavailable");
        await getPublicChatbot(bot.chatbot_id);
        const participant = await getPublicChatbotParticipant(image.chatbot_id);
        if (!participant || participant.id !== conversation.public_participant_id) throw new Error("Unavailable");
      }
    } else throw new Error("Unavailable");
    const file = getStorageBucket().file(image.storage_path);
    const [exists] = await file.exists();
    if (!exists) throw new Error("Unavailable");
    const stream = Readable.toWeb(file.createReadStream()) as ReadableStream<Uint8Array>;
    return new NextResponse(stream, { headers: {
      "Content-Type": image.mime_type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'", "Content-Disposition": "inline",
    } });
  } catch {
    return NextResponse.json({ error: "Image unavailable" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
}
