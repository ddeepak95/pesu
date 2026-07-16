"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { invalidateInstitutionAiPolicy } from "@/hooks/swr/useInstitutionAiPolicy";
import { setInstitutionAiConfigLocksAction } from "@/lib/ai/credentials/actions";
import {
  aiConfigCapabilities,
  type AiConfigSection,
} from "@/lib/ai/credentials/capabilities";
import type { ViewerRole } from "@/lib/settings/capabilities";
import type { AiInstitutionPolicy } from "@/types/aiSettings";

interface AiConfigLocksRowProps {
  institutionId: string;
  viewerRole: ViewerRole;
  institutionPolicy: AiInstitutionPolicy;
  section: AiConfigSection;
}

const SECTION_LABEL: Record<AiConfigSection, string> = {
  providers: "Allow institution admin to edit providers",
  functions: "Allow institution admin to edit model selections",
};

const SECTION_LOCK_KEY: Record<AiConfigSection, "allow_admin_edit_providers" | "allow_admin_edit_functions"> = {
  providers: "allow_admin_edit_providers",
  functions: "allow_admin_edit_functions",
};

const SECTION_POLICY_FIELD: Record<AiConfigSection, "allowAdminEditProviders" | "allowAdminEditFunctions"> = {
  providers: "allowAdminEditProviders",
  functions: "allowAdminEditFunctions",
};

export default function AiConfigLocksRow({
  institutionId,
  viewerRole,
  institutionPolicy,
  section,
}: AiConfigLocksRowProps) {
  // canToggleAllowAdminEdit doesn't vary by section (only super_admin may
  // toggle either lock), so either section's bundle reports the same value.
  const caps = aiConfigCapabilities({
    viewerRole,
    mode: "institution",
    section: "providers",
    institutionPolicy,
  });
  const canSave = caps.canToggleAllowAdminEdit;

  const policyField = SECTION_POLICY_FIELD[section];
  const [allow, setAllow] = useState(institutionPolicy[policyField]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!canSave) {
    return null;
  }

  const changed = allow !== institutionPolicy[policyField];

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const res = await setInstitutionAiConfigLocksAction({
        institutionId,
        lock: SECTION_LOCK_KEY[section],
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
      <div className="flex items-center justify-between gap-4">
        <Label className="text-sm font-normal">{SECTION_LABEL[section]}</Label>
        <Switch checked={allow} onCheckedChange={setAllow} disabled={pending} />
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
