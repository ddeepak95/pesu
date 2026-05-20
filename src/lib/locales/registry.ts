import type { LocaleDefinition, LegacySupportedLanguage } from "./types";

/**
 * App-wide locale registry. Add locales here (BCP-47).
 * Konvo and other features reference subsets of this list.
 */
export const APP_LOCALES: readonly LocaleDefinition[] = [
  { locale: "ar", label: "Arabic" },
  { locale: "bn", label: "Bengali" },
  { locale: "zh", label: "Chinese" },
  { locale: "cs", label: "Czech" },
  { locale: "da", label: "Danish" },
  { locale: "nl", label: "Dutch" },
  { locale: "en", label: "English" },
  { locale: "en-IN", label: "English (India)" },
  { locale: "fr", label: "French" },
  { locale: "de", label: "German" },
  { locale: "el", label: "Greek" },
  { locale: "he", label: "Hebrew" },
  { locale: "hi", label: "Hindi" },
  { locale: "id", label: "Indonesian" },
  { locale: "it", label: "Italian" },
  { locale: "kn", label: "Kannada" },
  { locale: "ja", label: "Japanese" },
  { locale: "ko", label: "Korean" },
  { locale: "ml", label: "Malayalam" },
  { locale: "mr", label: "Marathi" },
  { locale: "pa", label: "Punjabi" },
  { locale: "pt", label: "Portuguese" },
  { locale: "ru", label: "Russian" },
  { locale: "es", label: "Spanish" },
  { locale: "ta", label: "Tamil" },
  { locale: "te", label: "Telugu" },
  { locale: "th", label: "Thai" },
  { locale: "tr", label: "Turkish" },
  { locale: "uk", label: "Ukrainian" },
  { locale: "vi", label: "Vietnamese" },
] as const;

const LOCALE_BY_TAG = new Map(
  APP_LOCALES.map((entry) => [entry.locale, entry] as const),
);

export function getLocaleRegistryMap(): ReadonlyMap<string, LocaleDefinition> {
  return LOCALE_BY_TAG;
}

/** Legacy `{ code, name }` for gradual migration from `@/utils/supportedLanguages`. */
export function getAppLocalesLegacyShape(): LegacySupportedLanguage[] {
  return APP_LOCALES.map((entry) => ({
    code: entry.locale,
    name: entry.label,
  }));
}
