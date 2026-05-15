"use client";

import { useAiConfigReadiness } from "@/hooks/swr/useAiCapabilityConfigs";

interface AiConfigMisconfigBannerProps {
  classDbId: string;
  institutionId: string;
}

export default function AiConfigMisconfigBanner({
  classDbId,
  institutionId,
}: AiConfigMisconfigBannerProps) {
  const { data: readiness } = useAiConfigReadiness(classDbId, institutionId);

  if (!readiness?.showClassBanner) {
    return null;
  }

  return (
    <div
      className="rounded border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      role="alert"
    >
      <p className="font-medium">
        AI capabilities are disabled for this class. Please contact admin to
        enable.
      </p>
    </div>
  );
}
