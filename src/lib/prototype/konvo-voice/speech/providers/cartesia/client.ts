import "server-only";

const CARTESIA_API_BASE = "https://api.cartesia.ai";
export const CARTESIA_API_VERSION = "2026-03-01";

export function getCartesiaApiKey(): string {
  const key = process.env.CARTESIA_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "CARTESIA_API_KEY is not set. Add it to your local .env.local for Cartesia speech.",
    );
  }
  return key;
}

export function cartesiaHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${getCartesiaApiKey()}`,
    "Cartesia-Version": CARTESIA_API_VERSION,
  };
}

export { CARTESIA_API_BASE };
