import "server-only";

import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to your local .env.local for the voice prototype.",
    );
  }
  if (!client) {
    client = new OpenAI({ apiKey });
  }
  return client;
}
