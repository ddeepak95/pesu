import type { LocaleTag } from "@/lib/locales/types";

/**
 * Per-model locale support for Konvo speech.
 *
 * Language coverage is declared **per catalog model id**, and STT and TTS are
 * independent — a provider can support different locales for transcription vs
 * synthesis, and multiple models within a provider can each have their own
 * locale list (e.g. `whisper-1` vs `gpt-4o-mini-transcribe`).
 *
 * To add a new model: add an entry below (and a catalog row in
 * `src/lib/ai/catalog/data.ts`). To change a model's locales: edit the set/map
 * here without touching `konvoLocaleCapabilities.ts`.
 */

/** Locales an STT model can transcribe. */
export const KONVO_STT_MODEL_LOCALES: Readonly<
  Record<string, ReadonlySet<LocaleTag>>
> = {
  // OpenAI Whisper-quality language list.
  // @see https://developers.openai.com/api/docs/guides/speech-to-text#supported-languages
  "openai-gpt-4o-mini-transcribe": new Set<LocaleTag>([
    "ar", "zh", "cs", "da", "nl", "en", "en-IN", "fr", "de", "el", "he", "hi",
    "id", "it", "kn", "ja", "ko", "mr", "pt", "ru", "es", "ta", "th", "tr",
    "uk", "vi",
  ]),
  // Cartesia Ink Whisper STT (pesu-server LANGUAGE_CONSTANTS).
  "cartesia-ink-whisper": new Set<LocaleTag>([
    "ar", "bn", "zh", "cs", "da", "nl", "en", "en-IN", "fr", "de", "el", "he",
    "hi", "id", "it", "kn", "ja", "ko", "ml", "mr", "pa", "pt", "ru", "es",
    "ta", "te", "th", "tr", "uk", "vi",
  ]),
};

/**
 * Voices a TTS model can speak, keyed by locale.
 *
 * Presence of a locale key implies the model supports that locale. The voice id
 * is the developer-curated default voice for the (model, locale) pair.
 */
export const KONVO_TTS_MODEL_VOICES: Readonly<
  Record<string, Readonly<Record<LocaleTag, string>>>
> = {
  // OpenAI gpt-4o-mini-tts (Whisper-quality language coverage).
  "openai-gpt-4o-mini-tts": {
    ar: "alloy",
    zh: "coral",
    cs: "alloy",
    da: "alloy",
    nl: "alloy",
    en: "alloy",
    "en-IN": "alloy",
    fr: "shimmer",
    de: "echo",
    el: "alloy",
    he: "alloy",
    hi: "sage",
    id: "alloy",
    it: "alloy",
    kn: "alloy",
    ja: "shimmer",
    ko: "alloy",
    mr: "alloy",
    pt: "verse",
    ru: "alloy",
    es: "nova",
    ta: "alloy",
    th: "alloy",
    tr: "alloy",
    uk: "alloy",
    vi: "alloy",
  },
  // Cartesia Sonic 3.5 (pesu-server LANGUAGE_CONSTANTS).
  "cartesia-sonic-3-5": {
    ar: "002622d8-19d0-4567-a16a-f99c7397c062",
    bn: "2ba861ea-7cdc-43d1-8608-4045b5a41de5",
    zh: "c59c247b-6aa9-4ab6-91f9-9eabea7dc69e",
    cs: "82db1f84-5b96-4364-b04a-4c7ff80e2f8a",
    da: "a466f9e2-28eb-4bb7-925c-8e8984950700",
    nl: "da743a82-ddf2-4d9b-8eb8-ff67ca0b138e",
    en: "8d8ce8c9-44a4-46c4-b10f-9a927b99a853",
    "en-IN": "638efaaa-4d0c-442e-b701-3fae16aad012",
    fr: "ab636c8b-9960-4fb3-bb0c-b7b655fb9745",
    de: "1ade29fc-6b82-4607-9e70-361720139b12",
    el: "50849023-76e9-46c7-af52-9ec39888a165",
    he: "84b969ad-19c7-428d-b742-48d387f7f138",
    hi: "95d51f79-c397-46f9-b49a-23763d3eaa2d",
    id: "a053f6bc-7df4-40de-96d4-de026bc47ce8",
    it: "ee16f140-f6dc-490e-a1ed-c1d537ea0086",
    kn: "6baae46d-1226-45b5-a976-c7f9b797aae2",
    ja: "2b568345-1d48-4047-b25f-7baccf842eb0",
    ko: "e1717dc3-b87b-4720-aa7f-b6db290e0609",
    ml: "374b80da-e622-4dfc-90f6-1eeb13d331c9",
    mr: "f227bc18-3704-47fe-b759-8c78a450fdfa",
    pa: "991c62ce-631f-48b0-8060-2a0ebecbd15b",
    pt: "b603811e-54c2-4a0a-8854-09eab9ffa63f",
    ru: "1e4176b1-3db9-44d6-a601-4fe68b041942",
    es: "15d0c2e2-8d29-44c3-be23-d585d5f154a1",
    ta: "7f98e662-142d-41ba-89a2-12452640ce6d",
    te: "cf061d8b-a752-4865-81a2-57570a6e0565",
    th: "5de076e9-7b28-4442-b279-e7d80d573505",
    tr: "fa7bfcdc-603c-4bf1-a600-a371400d2f8c",
    uk: "05ffab9c-d380-4909-8375-cd12f59238c3",
    vi: "935a9060-373c-49e4-b078-f4ea6326987a",
  },
};

export function isSttModelLocaleSupported(
  sttModelId: string,
  locale: string,
): boolean {
  return KONVO_STT_MODEL_LOCALES[sttModelId]?.has(locale) ?? false;
}

export function isTtsModelLocaleSupported(
  ttsModelId: string,
  locale: string,
): boolean {
  const map = KONVO_TTS_MODEL_VOICES[ttsModelId];
  return Boolean(map && locale in map);
}

export function getTtsVoiceForModelAndLocale(
  ttsModelId: string,
  locale: string,
): string | undefined {
  return KONVO_TTS_MODEL_VOICES[ttsModelId]?.[locale];
}

export function getKonvoSttModelIds(): string[] {
  return Object.keys(KONVO_STT_MODEL_LOCALES);
}

export function getKonvoTtsModelIds(): string[] {
  return Object.keys(KONVO_TTS_MODEL_VOICES);
}

/** Union of all locales across any STT or TTS model registered for Konvo. */
export function getAllSpeechSupportedLocales(): Set<LocaleTag> {
  const out = new Set<LocaleTag>();
  for (const set of Object.values(KONVO_STT_MODEL_LOCALES)) {
    for (const locale of set) out.add(locale);
  }
  for (const map of Object.values(KONVO_TTS_MODEL_VOICES)) {
    for (const locale of Object.keys(map)) out.add(locale);
  }
  return out;
}
