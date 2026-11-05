import sharp from "sharp";

export const CHATBOT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const CHATBOT_IMAGE_FORMATS: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp",
};

/** Decode rather than trusting file extensions or the browser's content type. */
export async function validateChatbotImageUpload(buffer: Buffer, mimeType: string) {
  if (!Object.hasOwn(CHATBOT_IMAGE_FORMATS, mimeType) || !buffer.length || buffer.length > CHATBOT_IMAGE_MAX_BYTES)
    throw new Error("Choose a PNG, JPEG or WebP up to 10 MB");
  const processor = sharp(buffer, { limitInputPixels: 40_000_000, animated: false });
  const info = await processor.metadata();
  if (info.format !== CHATBOT_IMAGE_FORMATS[mimeType] || (info.pages ?? 1) > 1)
    throw new Error("Upload must be a still PNG, JPEG or WebP image");
  const validated = await processor.toBuffer();
  if (validated.length > CHATBOT_IMAGE_MAX_BYTES) throw new Error("Processed image exceeds 10 MB");
  return validated;
}
