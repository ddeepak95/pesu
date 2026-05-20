import type { ModelTask } from "@/lib/ai/catalog/types";
import { sortLocalesByRegistryOrder } from "@/lib/locales/helpers";
import type { LocaleTag } from "@/lib/locales/types";
import {
  getAllSpeechSupportedLocales,
  getKonvoSttModelIds,
  getKonvoTtsModelIds,
  getTtsVoiceForModelAndLocale,
  isSttModelLocaleSupported,
} from "./speechModelLocales";

export type KonvoTtsBinding = {
  modelId: string;
  voiceId: string;
};

/**
 * Per-locale overrides for Konvo. Voice/locale support is declared in
 * `speechModelLocales.ts`; this file only carries optional extras that don't
 * fit the per-model model.
 */
export type KonvoLocaleExtras = {
  /** Override provider API language param when it differs from toProviderLanguageCode(locale). */
  providerLanguageCode?: string;
  /** Rare: subset of selectable catalog LLMs for this locale only. */
  llmModelIds?: readonly string[];
};

export type KonvoLocaleCapability = {
  locale: LocaleTag;
  sttModelIds: readonly string[];
  tts: readonly KonvoTtsBinding[];
} & KonvoLocaleExtras;

/**
 * Optional per-locale extras. Add entries here only when a locale needs to
 * override the registry-derived provider language code or restrict the LLM
 * list. Locale enrollment itself is driven by `speechModelLocales.ts`.
 */
export const KONVO_LOCALE_EXTRAS: Readonly<
  Record<LocaleTag, KonvoLocaleExtras>
> = {};

function buildCapability(locale: LocaleTag): KonvoLocaleCapability {
  const sttModelIds = getKonvoSttModelIds().filter((id) =>
    isSttModelLocaleSupported(id, locale),
  );
  const tts: KonvoTtsBinding[] = [];
  for (const ttsId of getKonvoTtsModelIds()) {
    const voiceId = getTtsVoiceForModelAndLocale(ttsId, locale);
    if (voiceId) tts.push({ modelId: ttsId, voiceId });
  }
  return {
    locale,
    sttModelIds,
    tts,
    ...(KONVO_LOCALE_EXTRAS[locale] ?? {}),
  };
}

function buildCapabilities(): Record<LocaleTag, KonvoLocaleCapability> {
  const locales = sortLocalesByRegistryOrder([
    ...getAllSpeechSupportedLocales(),
  ]);
  const out: Record<LocaleTag, KonvoLocaleCapability> = {};
  for (const locale of locales) {
    const cap = buildCapability(locale);
    if (cap.sttModelIds.length === 0 || cap.tts.length === 0) continue;
    out[locale] = cap;
  }
  return out;
}

/**
 * Derived per-locale view: union of locales supported by any Konvo STT or TTS
 * model. Built from `speechModelLocales.ts` at module load. Keep this as the
 * read API for consumers that want a locale-keyed shape.
 */
export const KONVO_LOCALE_CAPABILITIES: Readonly<
  Record<LocaleTag, KonvoLocaleCapability>
> = buildCapabilities();

export function buildCatalogLocaleCodesFromCapabilities(
  modelId: string,
  task: Extract<ModelTask, "speech_to_text" | "text_to_speech">,
): string[] {
  const locales: string[] = [];
  for (const [locale, cap] of Object.entries(KONVO_LOCALE_CAPABILITIES)) {
    const supported =
      task === "speech_to_text"
        ? cap.sttModelIds.includes(modelId)
        : cap.tts.some((t) => t.modelId === modelId);
    if (supported) locales.push(locale);
  }
  return sortLocalesByRegistryOrder(locales);
}
