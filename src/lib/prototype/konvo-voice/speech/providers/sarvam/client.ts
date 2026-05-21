import "server-only";

const SARVAM_API_BASE = "https://api.sarvam.ai";

export function getSarvamApiKey(): string {
  const key = process.env.SARVAM_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "SARVAM_API_KEY is not set. Add it to your local .env.local for Sarvam speech.",
    );
  }
  return key;
}

export function sarvamHeaders(contentType?: string): HeadersInit {
  const headers: Record<string, string> = {
    "api-subscription-key": getSarvamApiKey(),
  };
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  return headers;
}

export { SARVAM_API_BASE };
