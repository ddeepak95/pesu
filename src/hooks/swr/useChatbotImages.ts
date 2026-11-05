import useSWR from "swr";
import { getChatbotImageLibrary } from "@/lib/queries/chatbotImages";
export function useChatbotImages(shortId: string | null) {
  return useSWR(shortId ? ["chatbotImages", shortId] : null, () => getChatbotImageLibrary(shortId!));
}
