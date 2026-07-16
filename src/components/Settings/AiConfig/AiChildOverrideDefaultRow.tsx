"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { invalidateInstitutionAiPolicy } from "@/hooks/swr/useInstitutionAiPolicy";
import { setInstitutionAiChildOverrideDefaultAction } from "@/lib/ai/credentials/actions";
import {
  aiConfigCapabilities,
  type AiConfigSection,
} from "@/lib/ai/credentials/capabilities";
import type { ViewerRole } from "@/lib/settings/capabilities";
import type { AiInstitutionPolicy } from "@/types/aiSettings";

interface AiChildOverrideDefaultRowProps {
  institutionId: string;
  viewerRole: ViewerRole;
  institutionPolicy: AiInstitutionPolicy;
  section: AiConfigSection;
}

const SECTION_LABEL: Record<AiConfigSection, string> = {
  providers: "Allow class teachers to edit providers by default",
  functions: "Allow class teachers to edit model selections by default",
};

const SECTION_LOCKED_HINT: Record<AiConfigSection, string> = {
  providers:
    "Enable “Allow institution admin to edit providers” for this institution first.",
  functions:
    "Enable “Allow institution admin to edit model selections” for this institution first.",
};

const SECTION_DEFAULT_FIELD: Record<
  AiConfigSection,
  "defaultAllowChildOverrideProviders" | "defaultAllowChildOverrideFunctions"
> = {
  providers: "defaultAllowChildOverrideProviders",
  functions: "defaultAllowChildOverrideFunctions",
};

export default function AiChildOverrideDefaultRow({
  institutionId,
  viewerRole,
  institutionPolicy,
  section,
}: AiChildOverrideDefaultRowProps) {
  const caps = aiConfigCapabilities({
    viewerRole,
    mode: "institution",
    section,
    institutionPolicy,
  });

  const defaultField = SECTION_DEFAULT_FIELD[section];
  const [allow, setAllow] = useState(institutionPolicy[defaultField]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (viewerRole !== "institution_admin" && viewerRole !== "super_admin") {
    return null;
  }

  const locked = !caps.canToggleDefaultChildOverride;
  const changed = allow !== institutionPolicy[defaultField];

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const res = await setInstitutionAiChildOverrideDefaultAction({
        institutionId,
        section,
        enabled: allow,
      });
      if (!res.ok) {
        setError(res.error ?? "Failed to save");
        return;
      }
      invalidateInstitutionAiPolicy(institutionId);
    });
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <Label className="text-sm font-normal">{SECTION_LABEL[section]}</Label>
          <Switch
            checked={allow}
            onCheckedChange={setAllow}
            disabled={locked || pending}
          />
        </div>
        {locked && (
          <p className="text-xs text-muted-foreground">
            {SECTION_LOCKED_HINT[section]}
          </p>
        )}
      </div>
      {changed && (
        <Button type="button" size="sm" onClick={handleSave} disabled={pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save permissions
        </Button>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
