import type { LanguageModelV3, SharedV3ProviderOptions } from "@ai-sdk/provider";
import { getLocaleRegistryMap } from "@/lib/locales/registry";
import {
  transliterationSchema,
  type TransliterationResult,
} from "./schemas/transliteration";
import { generateStructured } from "./structured";

export interface TransliterateMessageParams {
  model: LanguageModelV3;
  providerOptions?: SharedV3ProviderOptions;
  text: string;
  fromLanguage: string;
  toLanguage: string;
}

export async function transliterateMessage(
  params: TransliterateMessageParams,
): Promise<TransliterationResult> {
  const { model, providerOptions, text, fromLanguage, toLanguage } = params;

  const registry = getLocaleRegistryMap();
  const fromLabel = registry.get(fromLanguage)?.label ?? fromLanguage;
  const toLabel = registry.get(toLanguage)?.label ?? toLanguage;

  const systemPrompt =
    `Return a JSON object with:\n` +
    `- "transliteration": write the ${fromLabel} text sound-by-sound in the native script of ${toLabel} ` +
    `(e.g. Devanagari for Hindi, Arabic script for Urdu) so the learner can pronounce the ${fromLabel} ` +
    `words using familiar characters. Set to null if both languages share the same script.\n` +
    `- "translation": translate the text into ${toLabel}, written in the native script of ${toLabel}.\n` +
    `If the input text appears to already be written in ${toLabel}, set transliteration to null and return the original text unchanged as the translation.`;

  return generateStructured<TransliterationResult>({
    model,
    schema: transliterationSchema,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
    providerOptions,
  });
}
