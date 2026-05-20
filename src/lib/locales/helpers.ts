import { APP_LOCALES, getLocaleRegistryMap } from "./registry";
import type { LocaleDefinition, LocaleTag } from "./types";

const LOCALE_BY_TAG = getLocaleRegistryMap();

/** Normalize user input to a registry locale tag when possible. */
export function normalizeLocaleTag(input: string): LocaleTag {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  const parts = trimmed.split("-");
  const primary = parts[0]?.toLowerCase() ?? trimmed;
  if (parts.length === 1) {
    return LOCALE_BY_TAG.has(primary) ? primary : primary;
  }

  const region = parts
    .slice(1)
    .map((segment) =>
      segment.length <= 3
        ? segment.toUpperCase()
        : `${segment.charAt(0).toUpperCase()}${segment.slice(1).toLowerCase()}`,
    )
    .join("-");

  const normalized = region ? `${primary}-${region}` : primary;
  if (LOCALE_BY_TAG.has(normalized)) return normalized;
  if (LOCALE_BY_TAG.has(trimmed)) return trimmed;
  return normalized;
}

export function isKnownLocale(locale: string): boolean {
  return LOCALE_BY_TAG.has(normalizeLocaleTag(locale));
}

export function getLocaleDefinition(
  locale: string,
): LocaleDefinition | undefined {
  return LOCALE_BY_TAG.get(normalizeLocaleTag(locale));
}

export function getLocaleLabel(locale: string): string {
  return getLocaleDefinition(locale)?.label ?? locale;
}

/** Primary ISO 639-1 subtag for provider APIs that do not accept full BCP-47. */
export function toProviderLanguageCode(locale: string): string {
  const normalized = normalizeLocaleTag(locale);
  const primary = normalized.split("-")[0]?.toLowerCase();
  return primary || normalized;
}

export function getAppLocaleTags(): LocaleTag[] {
  return APP_LOCALES.map((entry) => entry.locale);
}

export function sortLocalesByRegistryOrder(locales: string[]): string[] {
  const order = new Map(getAppLocaleTags().map((tag, index) => [tag, index]));
  return [...locales].sort(
    (a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999),
  );
}
