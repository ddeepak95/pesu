import "server-only";

const SARVAM_API_BASE = "https://api.sarvam.ai";

export function getSarvamApiKey(overrideApiKey?: string): string {
  const key = (overrideApiKey ?? process.env.SARVAM_API_KEY)?.trim();
  if (!key) {
    throw new Error(
      "SARVAM_API_KEY is not set. Add it to your local .env.local for Sarvam speech.",
    );
  }
  return key;
}

export function sarvamHeaders(
  contentType?: string,
  overrideApiKey?: string,
): HeadersInit {
  const headers: Record<string, string> = {
    "api-subscription-key": getSarvamApiKey(overrideApiKey),
  };
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  return headers;
}

export { SARVAM_API_BASE };
