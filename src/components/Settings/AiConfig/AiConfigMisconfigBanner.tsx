"use client";

import { useAiCatalogReadiness } from "@/hooks/swr/useAiCatalogReadiness";
import { InfoBanner } from "@/components/ui/info-banner";

interface AiConfigMisconfigBannerProps {
  classDbId: string;
  institutionId: string;
}

export default function AiConfigMisconfigBanner({
  classDbId,
  institutionId,
}: AiConfigMisconfigBannerProps) {
  const { data: readiness } = useAiCatalogReadiness(classDbId, institutionId);

  if (!readiness?.showClassBanner) {
    return null;
  }

  return (
    <InfoBanner variant="error">
      <p className="font-medium">
        AI capabilities are disabled for this class. Please contact admin to
        enable.
      </p>
    </InfoBanner>
  );
}
