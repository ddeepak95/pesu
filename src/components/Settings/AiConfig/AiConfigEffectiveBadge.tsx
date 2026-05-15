import { AI_PROVIDERS } from "@/lib/ai/capabilities/registry";
import type { EffectiveAiCapabilityMeta } from "@/types/aiCapabilityConfig";

interface AiConfigEffectiveBadgeProps {
  meta: EffectiveAiCapabilityMeta;
}

export default function AiConfigEffectiveBadge({
  meta,
}: AiConfigEffectiveBadgeProps) {
  const providerLabel =
    meta.provider &&
    AI_PROVIDERS.find((p) => p.value === meta.provider)?.label;

  if (meta.source === "unconfigured") {
    return (
      <span className="inline-flex items-center rounded-md border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs font-normal text-destructive">
        Not configured
      </span>
    );
  }

  if (meta.source === "env") {
    return (
      <span className="inline-flex items-center rounded-md border border-transparent bg-secondary px-2 py-0.5 text-xs font-normal text-secondary-foreground">
        Platform env default
      </span>
    );
  }

  const hint = meta.keyHint ? `••••${meta.keyHint}` : "no key";
  const model = meta.modelId ? ` · ${meta.modelId}` : "";

  const sourceLabel =
    meta.source === "platform"
      ? "Platform"
      : meta.source === "institution"
        ? "Institution"
        : "Class";

  return (
    <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-normal text-muted-foreground">
      {sourceLabel}: {providerLabel ?? meta.provider}
      {model} · {hint}
    </span>
  );
}
