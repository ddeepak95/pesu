import type { ChatbotImage } from "@/types/chatbot";
export interface ChatbotLibrary { images: ChatbotImage[]; allowed: boolean; configurationError: string | null }
export async function getChatbotImageLibrary(shortId: string): Promise<ChatbotLibrary> {
  const response = await fetch(`/api/chatbots/${encodeURIComponent(shortId)}/images`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not load image library");
  return data;
}
export async function mutateChatbotImage(shortId: string, body: unknown) {
  const response = await fetch(`/api/chatbots/${encodeURIComponent(shortId)}/images`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Image operation failed");
  return data;
}
export function uploadChatbotImageFile(url: string, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.timeout = 120_000;
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Image upload failed. Please retry."));
    xhr.onerror = xhr.ontimeout = () => reject(new Error("Image upload interrupted. Please retry."));
    xhr.send(file);
  });
}
