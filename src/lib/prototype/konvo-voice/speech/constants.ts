/** Sarvam REST STT max duration per segment. */
export const SARVAM_STT_MAX_DURATION_MS = 30_000;

export const SARVAM_STT_CATALOG_MODEL_ID = "sarvam-saaras-v3-stt";

export function isSarvamSttCatalogModel(catalogModelId: string): boolean {
  return catalogModelId === SARVAM_STT_CATALOG_MODEL_ID;
}
