import "server-only";

import { CATALOG_MODELS } from "@/lib/ai/catalog/data";
import type { ModelCatalogEntry, ModelTask, ProviderId } from "@/lib/ai/catalog/types";

export {
  getLanguageLabel,
  intersectLanguageCodes,
} from "./sessionCatalogShared";

export function getCatalogEntry(modelId: string): ModelCatalogEntry | undefined {
  return CATALOG_MODELS.find((m) => m.id === modelId);
}

export function isProviderConfigured(providerId: ProviderId): boolean {
  switch (providerId) {
    case "openai":
      return Boolean(process.env.OPENAI_API_KEY?.trim());
    case "google":
      return Boolean(
        process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
          process.env.GEMINI_API_KEY?.trim(),
      );
    case "cartesia":
      return Boolean(process.env.CARTESIA_API_KEY?.trim());
    case "sarvam":
      return Boolean(process.env.SARVAM_API_KEY?.trim());
    default:
      return false;
  }
}

export function getSelectableModels(task: ModelTask): ModelCatalogEntry[] {
  return CATALOG_MODELS.filter(
    (m) =>
      m.tasks.includes(task) &&
      m.status === "available" &&
      isProviderConfigured(m.providerId),
  );
}
