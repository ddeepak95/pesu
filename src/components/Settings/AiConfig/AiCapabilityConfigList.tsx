"use client";

import type { ViewerRole } from "@/lib/settings/capabilities";
import type { EffectiveAiConfigs } from "@/types/aiCapabilityConfig";

import AiConfigLocksRow from "./AiConfigLocksRow";
import AiCapabilityConfigRow, {
  type AiConfigListMode,
} from "./AiCapabilityConfigRow";
import { TEXT_CAPABILITY_KEY } from "@/lib/ai/capabilities/registry";

interface AiCapabilityConfigListProps {
  mode: AiConfigListMode;
  scopeId: string;
  viewerRole: ViewerRole;
  effective: EffectiveAiConfigs;
  classShortId?: string | null;
  institutionEffective?: EffectiveAiConfigs;
}

export default function AiCapabilityConfigList({
  mode,
  scopeId,
  viewerRole,
  effective,
  classShortId = null,
  institutionEffective,
}: AiCapabilityConfigListProps) {
  return (
    <div className="space-y-4">
      {mode === "institution" && (
        <AiConfigLocksRow
          institutionId={scopeId}
          viewerRole={viewerRole}
          institutionPolicy={effective.institutionPolicy}
        />
      )}

      <AiCapabilityConfigRow
        mode={mode}
        effective={effective}
        viewerRole={viewerRole}
        scopeId={scopeId}
        classShortId={classShortId}
        institutionEffectiveMeta={
          mode === "class"
            ? institutionEffective?.capabilities[TEXT_CAPABILITY_KEY]
            : undefined
        }
      />
    </div>
  );
}
