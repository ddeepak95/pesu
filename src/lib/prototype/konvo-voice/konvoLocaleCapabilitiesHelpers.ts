import { CATALOG_MODELS } from "@/lib/ai/catalog/data";
import {
  getLocaleLabel,
  isKnownLocale,
  sortLocalesByRegistryOrder,
  toProviderLanguageCode,
} from "@/lib/locales/helpers";
import type { LocaleTag } from "@/lib/locales/types";
import {
  KONVO_LOCALE_CAPABILITIES,
  KONVO_LOCALE_EXTRAS,
} from "./konvoLocaleCapabilities";
import {
  KONVO_STT_MODEL_LOCALES,
  KONVO_TTS_MODEL_VOICES,
  getAllSpeechSupportedLocales,
  getTtsVoiceForModelAndLocale,
  isSttModelLocaleSupported,
  isTtsModelLocaleSupported,
} from "./speechModelLocales";

export class KonvoLocaleVoiceError extends Error {
  constructor(
    public readonly ttsModelId: string,
    public readonly locale: string,
  ) {
    super(
      `No TTS voice mapped for model "${ttsModelId}" and locale "${locale}". ` +
        "Add an entry in src/lib/prototype/konvo-voice/speechModelLocales.ts.",
    );
    this.name = "KonvoLocaleVoiceError";
  }
}

export function getKonvoEnabledLocales(): LocaleTag[] {
  return sortLocalesByRegistryOrder(Object.keys(KONVO_LOCALE_CAPABILITIES));
}

export function getKonvoLocaleLabel(locale: string): string {
  return getLocaleLabel(locale);
}

export function getProviderLanguageCodeForKonvo(locale: string): string {
  return (
    KONVO_LOCALE_EXTRAS[locale]?.providerLanguageCode ??
    toProviderLanguageCode(locale)
  );
}

export function isKonvoSttSupported(locale: string, sttModelId: string): boolean {
  return isSttModelLocaleSupported(sttModelId, locale.trim());
}

export function isKonvoTtsSupported(locale: string, ttsModelId: string): boolean {
  return isTtsModelLocaleSupported(ttsModelId, locale.trim());
}

export function getKonvoLlmModelIdsForLocale(
  locale: string,
  selectableLlmIds: readonly string[],
): readonly string[] {
  const override = KONVO_LOCALE_EXTRAS[locale.trim()]?.llmModelIds;
  return override ?? selectableLlmIds;
}

export function isKonvoLlmSupported(
  locale: string,
  llmModelId: string,
  selectableLlmIds: readonly string[],
): boolean {
  return getKonvoLlmModelIdsForLocale(locale, selectableLlmIds).includes(
    llmModelId,
  );
}

export function intersectKonvoLocales(
  sttModelId: string,
  ttsModelId: string,
  llmModelId: string,
  selectableLlmIds: readonly string[],
): LocaleTag[] {
  return getKonvoEnabledLocales().filter(
    (locale) =>
      isKonvoSttSupported(locale, sttModelId) &&
      isKonvoTtsSupported(locale, ttsModelId) &&
      isKonvoLlmSupported(locale, llmModelId, selectableLlmIds),
  );
}

/** Locales supported by both STT and TTS catalog models (no LLM filter). */
export function intersectSpeechLocales(
  sttModelId: string,
  ttsModelId: string,
): LocaleTag[] {
  return sortLocalesByRegistryOrder(
    [...getAllSpeechSupportedLocales()].filter(
      (locale) =>
        isKonvoSttSupported(locale, sttModelId) &&
        isKonvoTtsSupported(locale, ttsModelId),
    ),
  );
}

export function resolveTtsVoice(ttsModelId: string, locale: string): string {
  const voiceId = getTtsVoiceForModelAndLocale(ttsModelId, locale.trim());
  if (!voiceId) {
    throw new KonvoLocaleVoiceError(ttsModelId, locale);
  }
  return voiceId;
}

function assertCatalogModel(
  modelId: string,
  task: "speech_to_text" | "text_to_speech",
): void {
  const entry = CATALOG_MODELS.find((m) => m.id === modelId);
  if (!entry?.tasks.includes(task)) {
    throw new Error(`Konvo references unknown ${task} model "${modelId}".`);
  }
  if (entry.status !== "available") {
    throw new Error(`Konvo ${task} model "${modelId}" is not available.`);
  }
}

export function assertKonvoCapabilitiesValid(): void {
  for (const [modelId, locales] of Object.entries(KONVO_STT_MODEL_LOCALES)) {
    assertCatalogModel(modelId, "speech_to_text");
    if (locales.size === 0) {
      throw new Error(`Konvo STT model "${modelId}" has no locales.`);
    }
    for (const locale of locales) {
      if (!isKnownLocale(locale)) {
        throw new Error(
          `STT model "${modelId}" references unknown locale "${locale}".`,
        );
      }
    }
  }

  for (const [modelId, voices] of Object.entries(KONVO_TTS_MODEL_VOICES)) {
    assertCatalogModel(modelId, "text_to_speech");
    const entries = Object.entries(voices);
    if (entries.length === 0) {
      throw new Error(`Konvo TTS model "${modelId}" has no voices.`);
    }
    for (const [locale, voiceId] of entries) {
      if (!isKnownLocale(locale)) {
        throw new Error(
          `TTS model "${modelId}" references unknown locale "${locale}".`,
        );
      }
      if (!voiceId.trim()) {
        throw new Error(`Empty TTS voice for "${modelId}" / "${locale}".`);
      }
    }
  }

  for (const [locale, extras] of Object.entries(KONVO_LOCALE_EXTRAS)) {
    if (!isKnownLocale(locale)) {
      throw new Error(`KONVO_LOCALE_EXTRAS has unknown locale "${locale}".`);
    }
    if (extras.llmModelIds) {
      for (const llmId of extras.llmModelIds) {
        const entry = CATALOG_MODELS.find((m) => m.id === llmId);
        if (!entry?.tasks.includes("text_generation")) {
          throw new Error(
            `Invalid Konvo LLM model "${llmId}" for locale "${locale}".`,
          );
        }
      }
    }
  }

  for (const [locale, cap] of Object.entries(KONVO_LOCALE_CAPABILITIES)) {
    if (cap.locale !== locale) {
      throw new Error(
        `Derived Konvo capability key "${locale}" must match capability.locale "${cap.locale}".`,
      );
    }
    if (cap.sttModelIds.length === 0) {
      throw new Error(`Konvo locale "${locale}" has no STT models.`);
    }
    if (cap.tts.length === 0) {
      throw new Error(`Konvo locale "${locale}" has no TTS models.`);
    }
  }
}
