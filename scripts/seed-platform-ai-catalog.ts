/**
 * Seeds platform-scoped AI catalog rows for local dev (provider key + text bindings).
 * Run after `supabase db reset` when GEMINI_API_KEY and AI_CREDENTIALS_ENCRYPTION_KEY
 * are set in `.env.local`.
 */
import { createCipheriv, randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

import { TEXT_CAPABILITY_KEY } from "../src/lib/ai/capabilities/registry";
import { subFunctionBindingKey } from "../src/lib/ai/catalog/helpers";

const PLATFORM_SCOPE_ID = "00000000-0000-4000-8000-000000000001";

const SEED_ADMIN_USER_ID = "00000000-0000-0000-0000-000000000010";
const GOOGLE_MODEL_ID = "gemini-3-flash-preview";

function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function encryptApiKey(plaintext: string): string {
  const raw = process.env.AI_CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("AI_CREDENTIALS_ENCRYPTION_KEY is not set");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "AI_CREDENTIALS_ENCRYPTION_KEY must be 32 bytes (base64-encoded)",
    );
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function keyHintFromPlaintext(apiKey: string): string {
  const trimmed = apiKey.trim();
  return trimmed.length < 4 ? "****" : trimmed.slice(-4);
}

function getGoogleApiKey(): string {
  const key =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    "";
  if (!key) {
    throw new Error(
      "Set GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY in .env.local",
    );
  }
  return key;
}

function getSupabaseServiceClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_LOCAL_URL?.trim() ||
    "http://127.0.0.1:54321";
  const serviceKey = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) {
    throw new Error("Set SUPABASE_LOCAL_SERVICE_ROLE_KEY in .env.local");
  }
  if (!process.env.AI_CREDENTIALS_ENCRYPTION_KEY?.trim()) {
    throw new Error("Set AI_CREDENTIALS_ENCRYPTION_KEY in .env.local");
  }
  return createClient(url, serviceKey);
}

async function main() {
  loadEnvLocal();
  const apiKey = getGoogleApiKey();
  const supabase = getSupabaseServiceClient();
  const now = new Date().toISOString();
  const encrypted = encryptApiKey(apiKey);
  const keyHint = keyHintFromPlaintext(apiKey);

  const { error: providerError } = await supabase
    .from("ai_provider_activations")
    .upsert(
      {
        scope: "platform",
        scope_id: PLATFORM_SCOPE_ID,
        provider_id: "google",
        use_platform_default: false,
        is_active: true,
        encrypted_api_key: encrypted,
        key_hint: keyHint,
        updated_by: SEED_ADMIN_USER_ID,
        updated_at: now,
      },
      { onConflict: "scope,scope_id,provider_id" },
    );
  if (providerError) throw providerError;

  const reasoning = {
    kind: "google",
    availableLevels: ["minimal", "low", "medium", "high"],
    thinkingLevel: "minimal",
  };

  const bindings = [
    {
      binding_key: TEXT_CAPABILITY_KEY,
      provider_id: "google",
      model_id: GOOGLE_MODEL_ID,
    },
    {
      binding_key: subFunctionBindingKey(TEXT_CAPABILITY_KEY, "rubric_generation"),
      provider_id: "google",
      model_id: GOOGLE_MODEL_ID,
    },
  ];

  for (const binding of bindings) {
    const { error } = await supabase.from("ai_function_bindings").upsert(
      {
        scope: "platform",
        scope_id: PLATFORM_SCOPE_ID,
        binding_key: binding.binding_key,
        provider_id: binding.provider_id,
        model_id: binding.model_id,
        reasoning_json: reasoning,
        updated_by: SEED_ADMIN_USER_ID,
        updated_at: now,
      },
      { onConflict: "scope,scope_id,binding_key" },
    );
    if (error) throw error;
  }

  console.log(
    "Platform AI catalog seeded (google provider + text / rubric_generation bindings).",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
