import type { MeteredTextModel } from "@/lib/ai/gateway";
import { getLocaleRegistryMap } from "@/lib/locales/registry";
import {
  transliterationSchema,
  type TransliterationResult,
} from "./schemas/transliteration";

export interface TransliterateMessageParams {
  handle: MeteredTextModel;
  text: string;
  fromLanguage: string;
  toLanguage: string;
}

export async function transliterateMessage(
  params: TransliterateMessageParams,
): Promise<TransliterationResult> {
  const { handle, text, fromLanguage, toLanguage } = params;

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

  return handle.generateStructured<TransliterationResult>({
    schema: transliterationSchema,
    schemaName: "transliterationSchema",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
  });
}
