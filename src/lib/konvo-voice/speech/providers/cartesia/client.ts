import "server-only";

import { CARTESIA_API_BASE, CARTESIA_API_VERSION } from "./constants";

export { CARTESIA_API_BASE, CARTESIA_API_VERSION };

export function getCartesiaApiKey(overrideApiKey?: string): string {
  const key = (overrideApiKey ?? process.env.CARTESIA_API_KEY)?.trim();
  if (!key) {
    throw new Error(
      "CARTESIA_API_KEY is not set. Add it to your local .env.local for Cartesia speech.",
    );
  }
  return key;
}

export function cartesiaHeaders(overrideApiKey?: string): HeadersInit {
  return {
    Authorization: `Bearer ${getCartesiaApiKey(overrideApiKey)}`,
    "Cartesia-Version": CARTESIA_API_VERSION,
  };
}
