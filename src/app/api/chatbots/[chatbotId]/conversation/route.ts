import { requireChatbotAccess } from "@/lib/chatbots/access";
import { NextRequest, NextResponse } from "next/server";
import { ChatbotAccessError } from "@/lib/chatbots/server";
import { createServiceRoleClient } from "@/lib/supabase-server";
import { isKnownLocale } from "@/lib/locales";
import { classifyAiError } from "@/lib/ai/errors";

export async function POST(request: NextRequest, { params }: { params: Promise<{ chatbotId: string }> }) {
  try {
    const { chatbotId } = await params;
    const body = await request.json();
    const preview = body.preview === true;
    const publicMode = body.publicMode === true;
    if (publicMode && request.headers.get("origin") !== request.nextUrl.origin) throw new ChatbotAccessError("Invalid request origin", 403);
    const { supabase, actorId, ownerColumn, bot } = await requireChatbotAccess(chatbotId, preview, publicMode);
    if (body.language !== undefined) {
      if (typeof body.language !== "string" || !isKnownLocale(body.language) || typeof body.conversationId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.conversationId)) {
        return NextResponse.json({ error: "Invalid conversation language" }, { status: 400 });
      }
      const { data: conversation } = await supabase.from("chatbot_conversations").select("id").eq("id", body.conversationId).eq("chatbot_id", bot.id).eq("is_preview", preview).eq(ownerColumn, actorId).maybeSingle();
      if (!conversation) throw new ChatbotAccessError("Conversation not found", 404);
      const { error } = await createServiceRoleClient().rpc("set_chatbot_conversation_language", { p_conversation_id: conversation.id, p_actor_id: actorId, p_language: body.language });
      if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 409 });
      return NextResponse.json({ ok: true });
    }
    if (typeof body.restart !== "boolean" || (body.restart && (typeof body.expectedId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.expectedId)))) {
      return NextResponse.json({ error: "Invalid conversation request" }, { status: 400 });
    }
    if (body.initialLanguage !== undefined && (typeof body.initialLanguage !== "string" || !isKnownLocale(body.initialLanguage))) {
      return NextResponse.json({ error: "Invalid conversation language" }, { status: 400 });
    }
    const { data, error } = await createServiceRoleClient().rpc("open_chatbot_with_language", {
      p_chatbot_id: bot.id, p_actor_id: actorId, p_preview: preview,
      p_restart: body.restart, p_expected_id: body.restart ? body.expectedId : null,
      p_language: body.initialLanguage ?? null,
    }).single();
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 409 });
    return NextResponse.json({ conversation: data });
  } catch (error) {
    return NextResponse.json({ error: classifyAiError(error).message }, { status: error instanceof ChatbotAccessError ? error.status : 400 });
  }
}
