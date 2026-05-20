import { APP_LOCALES } from "./registry";
import { normalizeLocaleTag } from "./helpers";

const BCP47_PATTERN = /^[a-z]{2}(-[A-Za-z0-9]{2,8})*$/;

export function assertLocaleRegistryValid(): void {
  const seen = new Set<string>();

  for (const entry of APP_LOCALES) {
    if (entry.locale !== entry.locale.trim()) {
      throw new Error(`Locale "${entry.locale}" must not have surrounding whitespace.`);
    }
    if (entry.locale !== normalizeLocaleTag(entry.locale)) {
      throw new Error(
        `Locale "${entry.locale}" must match registry normalization (use normalizeLocaleTag).`,
      );
    }
    if (!BCP47_PATTERN.test(entry.locale)) {
      throw new Error(`Locale "${entry.locale}" is not a valid BCP-47 tag shape.`);
    }
    if (!entry.label.trim()) {
      throw new Error(`Locale "${entry.locale}" must have a non-empty label.`);
    }
    if (seen.has(entry.locale)) {
      throw new Error(`Duplicate locale in APP_LOCALES: "${entry.locale}".`);
    }
    seen.add(entry.locale);
  }
}
