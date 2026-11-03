import "server-only";
import { requirePreviewChatbot, requireStudentChatbot, ChatbotAccessError } from "./server";
import { requirePublicChatbot } from "./publicServer";

export async function requireChatbotAccess(shortId: string, preview: boolean, publicMode: boolean) {
  if (preview && publicMode) throw new ChatbotAccessError("Invalid chat mode", 400);
  if (publicMode) return requirePublicChatbot(shortId);
  const access = await (preview ? requirePreviewChatbot(shortId) : requireStudentChatbot(shortId));
  return { ...access, actorId: access.user.id, userId: access.user.id, ownerColumn: preview ? "preview_owner_id" : "student_id" };
}
