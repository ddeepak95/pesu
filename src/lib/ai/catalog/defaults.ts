import { TEXT_CAPABILITY_KEY } from "@/lib/ai/capabilities/registry";

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
  const functions: LocalAiSettingsState["functions"] =
    scope === "platform"
      ? {
          [TEXT_CAPABILITY_KEY]: {
            providerId: "google",
            modelId: "gemini-3-flash-preview",
            reasoning: {
              kind: "google",
              availableLevels: ["minimal", "low", "medium", "high"],
              thinkingLevel: "minimal",
            },
          },
        }
      : {};
  return { providers, functions };
}
