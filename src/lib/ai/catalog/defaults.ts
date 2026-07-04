import { CATALOG_PROVIDER_IDS } from "./data";
import type {
  AiSettingsScope,
  LocalAiSettingsState,
  ProviderActivationState,
} from "./types";

function defaultProviderState(
  scope: AiSettingsScope,
): ProviderActivationState {
  return {
    isActive: false,
    apiKey: "",
    keyHint: null,
    usePlatformDefault: scope !== "platform",
  };
}

export function createDefaultLocalAiSettings(
  scope: AiSettingsScope,
): LocalAiSettingsState {
  const providers = {} as LocalAiSettingsState["providers"];
  for (const id of CATALOG_PROVIDER_IDS) {
    providers[id] = defaultProviderState(scope);
  }
  return { providers, functions: {} };
}
