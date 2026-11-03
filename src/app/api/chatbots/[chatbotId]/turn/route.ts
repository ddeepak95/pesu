import { requireChatbotAccess } from "@/lib/chatbots/access";
import type { ChatbotConversation } from "@/types/chatbot";
import { NextRequest, NextResponse } from "next/server";
import {
  ChatbotAccessError,
} from "@/lib/chatbots/server";
import {
  buildChatbotPrompt,
  chatbotConversationLanguage,
} from "@/lib/chatbots/config";
import { resolveMeteredModel, runWithAiContext } from "@/lib/ai/gateway";
import { createServiceRoleClient } from "@/lib/supabase-server";
import { classifyAiError } from "@/lib/ai/errors";

export const maxDuration = 120;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  const state: {
    reservation: { conversationId: string; messageId: string } | null;
  } = { reservation: null };
  try {
    const { chatbotId } = await params;
    const body = await request.json();
    const preview = body.preview === true;
    const opening = body.opening === true;
    const publicMode = body.publicMode === true;
    if (publicMode && request.headers.get("origin") !== request.nextUrl.origin) throw new ChatbotAccessError("Invalid request origin", 403);
    const { supabase, actorId, userId, ownerColumn, bot } = await requireChatbotAccess(chatbotId, preview, publicMode);
    if (
      typeof body.conversationId !== "string" ||
      !uuid.test(body.conversationId) ||
      typeof body.messageId !== "string" ||
      !uuid.test(body.messageId) ||
      (!opening &&
        (typeof body.content !== "string" ||
          !body.content.trim() ||
          body.content.length > 10000))
    ) {
      return NextResponse.json(
        { error: "Invalid message (maximum 10000 characters)" },
        { status: 400 },
      );
    }
    const { data: conversation } = await supabase
      .from("chatbot_conversations")
      .select("id")
      .eq("id", body.conversationId)
      .eq("chatbot_id", bot.id)
      .eq("is_preview", preview)
      .eq(ownerColumn, actorId)
      .maybeSingle();
    if (!conversation)
      throw new ChatbotAccessError("Conversation not found", 404);
    return await runWithAiContext(
      { userId, classId: bot.class_id },
      async () => {
        const handle = await resolveMeteredModel({
          appFunctionKey: "text.chat_tutoring",
          context: {
            classDbId: bot.class_id,
            userId,
            relatedEntity: {
              type: "chatbot_conversation",
              id: conversation.id,
            },
          },
        });
        const service = createServiceRoleClient();
        const { data: reservedConversation, error: reserveError } =
          await service
            .rpc("reserve_chatbot_turn", {
              p_conversation_id: conversation.id,
              p_student_id: actorId,
              p_message_id: body.messageId,
              p_content: opening ? null : body.content,
            })
            .single<ChatbotConversation>();
        if (reserveError)
          return NextResponse.json(
            { error: reserveError.message },
            { status: 409 },
          );
        state.reservation = {
          conversationId: conversation.id,
          messageId: body.messageId,
        };
        // Reload settings after admission: teacher edits take the same DB lock as
        // admission, so every newly admitted turn sees the current configuration.
        const { data: currentBot, error: botError } = await service
          .from("chatbots")
          .select("*")
          .eq("id", bot.id)
          .single();
        if (botError) throw botError;
        const history: Array<{ role: "user" | "assistant"; content: string }> =
          [];
        for (let offset = 0; ; offset += 500) {
          const { data: rows, error } = await service
            .from("chatbot_messages")
            .select("role, content")
            .eq("conversation_id", conversation.id)
            .eq("status", "complete")
            .order("created_at")
            .order("id")
            .range(offset, offset + 499);
          if (error) throw error;
          history.push(
            ...(rows ?? []).map((row) => ({
              role: row.role as "user" | "assistant",
              content: row.content as string,
            })),
          );
          if (!rows || rows.length < 500) break;
        }
        const encoder = new TextEncoder();
        return new Response(
          new ReadableStream({
            async start(controller) {
              // Continue saving an admitted reply even if the browser disconnects.
              const emit = (event: unknown) => {
                try {
                  controller.enqueue(
                    encoder.encode(JSON.stringify(event) + "\n"),
                  );
                } catch {
                  /* disconnected */
                }
              };
              try {
                const result = await handle.generateChat({
                  onText: (text) => emit({ type: "delta", text }),
                  messages: [
                    {
                      role: "system",
                      content: buildChatbotPrompt({ ...currentBot, language: chatbotConversationLanguage(currentBot, reservedConversation?.language ?? null) }),
                    },
                    ...history,
                    {
                      role: "user",
                      content: opening
                        ? "Begin the conversation"
                        : body.content.trim(),
                    },
                  ],
                  webSearch: currentBot.web_search,
                  imageSearch: currentBot.image_search,
                });
                const { error: finishError } = await service.rpc(
                  "finish_chatbot_turn",
                  {
                    p_conversation_id: conversation.id,
                    p_message_id: body.messageId,
                    p_reply: result.text,
                    p_sources: result.sources,
                    p_search_entry_point: result.searchEntryPoint,
                    p_invocation_id: result.invocationId,
                  },
                );
                if (finishError) throw finishError;
                state.reservation = null;
                emit({ type: "done" });
              } catch (error) {
                const { error: cleanupError } = await service.rpc(
                  "finish_chatbot_turn",
                  {
                    p_conversation_id: conversation.id,
                    p_message_id: body.messageId,
                    p_reply: null,
                  },
                );
                if (cleanupError)
                  console.error(
                    "[chatbot] Stream cleanup failed",
                    cleanupError.message,
                  );
                emit({ type: "error", error: classifyAiError(error).message });
              } finally {
                try {
                  controller.close();
                } catch {
                  /* disconnected */
                }
              }
            },
          }),
          {
            headers: {
              "Content-Type": "application/x-ndjson",
              "Cache-Control": "no-cache, no-transform",
              "X-Accel-Buffering": "no",
            },
          },
        );
      },
    );
  } catch (error) {
    if (state.reservation) {
      const { error: cleanupError } = await createServiceRoleClient().rpc(
        "finish_chatbot_turn",
        {
          p_conversation_id: state.reservation.conversationId,
          p_message_id: state.reservation.messageId,
          p_reply: null,
        },
      );
      if (cleanupError)
        console.error("[chatbot] Turn cleanup failed", cleanupError.message);
    }
    const classified = classifyAiError(error);
    return NextResponse.json(
      { error: classified.message, code: classified.code },
      {
        status:
          error instanceof ChatbotAccessError
            ? error.status
            : classified.code === "QUOTA_EXCEEDED"
              ? 402
              : 503,
      },
    );
  }
}
