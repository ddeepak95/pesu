import "server-only";

import OpenAI from "openai";

let client: OpenAI | null = null;
let cachedApiKey: string | null = null;

export function getOpenAIClient(overrideApiKey?: string): OpenAI {
  const apiKey = overrideApiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to your local .env.local for the voice prototype.",
    );
  }
  if (!client || cachedApiKey !== apiKey) {
    client = new OpenAI({ apiKey });
    cachedApiKey = apiKey;
  }
  return client;
}
