import { getKonvoEnabledLocales, intersectKonvoLocales } from "./konvoLocaleCapabilitiesHelpers";

export { getKonvoLocaleLabel as getLanguageLabel } from "./konvoLocaleCapabilitiesHelpers";

/** @deprecated Use intersectKonvoLocales with selectableLlmIds */
export function intersectLanguageCodes(
  sttModelId: string,
  ttsModelId: string,
  llmModelId: string,
  selectableLlmIds?: readonly string[],
): string[] {
  const llmIds = selectableLlmIds ?? [];
  return intersectKonvoLocales(sttModelId, ttsModelId, llmModelId, llmIds);
}

export function getKonvoPrototypeLocaleCodes(): string[] {
  return getKonvoEnabledLocales();
}
