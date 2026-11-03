import { NextRequest, NextResponse } from "next/server";
import { ChatbotAccessError } from "@/lib/chatbots/server";
import { getPublicChatbot, getPublicChatbotParticipant, createPublicChatbotParticipant, logoutPublicChatbot } from "@/lib/chatbots/publicServer";

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
function failure(error: unknown) {
  return json({ error: error instanceof ChatbotAccessError ? error.message : "Could not load public chatbot" }, error instanceof ChatbotAccessError ? error.status : 500);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ chatbotId: string }> }) {
  try {
    const { bot, supabase } = await getPublicChatbot((await params).chatbotId);
    const participant = await getPublicChatbotParticipant(bot.id);
    const view = request.nextUrl.searchParams.get("view");
    if (!view) return json({ bot, participant });
    if (!participant) throw new ChatbotAccessError("Enter your name to begin", 401);
    if (view === "conversations") {
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from("chatbot_conversations").select("*")
          .eq("chatbot_id", bot.id).eq("public_participant_id", participant.id)
          .order("sequence", { ascending: false }).range(offset, offset + 499);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 500) return json(rows);
      }
    }
    if (view === "messages") {
      const id = request.nextUrl.searchParams.get("conversationId");
      if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new ChatbotAccessError("Invalid conversation", 400);
      const { data: conversation, error: accessError } = await supabase.from("chatbot_conversations").select("id")
        .eq("id", id).eq("chatbot_id", bot.id).eq("public_participant_id", participant.id).maybeSingle();
      if (accessError) throw accessError;
      if (!conversation) throw new ChatbotAccessError("Conversation not found", 404);
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from("chatbot_messages").select("*")
          .eq("conversation_id", id).order("created_at").order("id").range(offset, offset + 499);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 500) return json(rows);
      }
    }
    throw new ChatbotAccessError("Invalid request", 400);
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ chatbotId: string }> }) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) throw new ChatbotAccessError("Invalid request origin", 403);
    const { bot } = await getPublicChatbot((await params).chatbotId);
    const body = await request.json();
    if (body.action === "logout") {
      await logoutPublicChatbot(bot.id);
      return json({ ok: true });
    }
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 200) throw new ChatbotAccessError("Enter a name of up to 200 characters", 400);
    if (!await getPublicChatbotParticipant(bot.id)) await createPublicChatbotParticipant(bot.id, body.name.trim());
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
