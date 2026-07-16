"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { invalidateInstitutionAiPolicy } from "@/hooks/swr/useInstitutionAiPolicy";
import { setInstitutionAiConfigLocksAction } from "@/lib/ai/credentials/actions";
import { aiConfigCapabilities } from "@/lib/ai/credentials/capabilities";
import type { ViewerRole } from "@/lib/settings/capabilities";
import type { AiInstitutionPolicy } from "@/types/aiSettings";

interface AiConfigLocksRowProps {
  institutionId: string;
  viewerRole: ViewerRole;
  institutionPolicy: AiInstitutionPolicy;
}

export default function AiConfigLocksRow({
  institutionId,
  viewerRole,
  institutionPolicy,
}: AiConfigLocksRowProps) {
  const caps = aiConfigCapabilities({
    viewerRole,
    mode: "institution",
    institutionPolicy,
  });

  const [allowAdminEdit, setAllowAdminEdit] = useState(
    institutionPolicy.allowAdminEdit,
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasChanges = allowAdminEdit !== institutionPolicy.allowAdminEdit;

  const canSave = caps.canToggleAllowAdminEdit;

  if (!canSave) {
    return null;
  }

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const res = await setInstitutionAiConfigLocksAction({
        institutionId,
        lock: "allow_admin_edit",
        enabled: allowAdminEdit,
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
      <p className="text-sm font-medium">AI configuration permissions</p>
      <div className="flex items-center justify-between gap-4">
        <Label className="text-sm font-normal">
          Allow institution admin to edit
        </Label>
        <Switch
          checked={allowAdminEdit}
          onCheckedChange={setAllowAdminEdit}
          disabled={pending}
        />
      </div>
      {hasChanges && (
        <Button type="button" size="sm" onClick={handleSave} disabled={pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save permissions
        </Button>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
