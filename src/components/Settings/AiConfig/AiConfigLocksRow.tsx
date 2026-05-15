"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { invalidateAiConfigCache } from "@/hooks/swr/useAiCapabilityConfigs";
import { setInstitutionAiConfigLocksAction } from "@/lib/ai/credentials/actions";
import { aiConfigCapabilities } from "@/lib/ai/credentials/capabilities";
import type { ViewerRole } from "@/lib/settings/capabilities";
import type { AiInstitutionPolicy } from "@/types/aiCapabilityConfig";

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
  const [allowChildOverride, setAllowChildOverride] = useState(
    institutionPolicy.allowChildOverride,
  );
  const [allowUsePlatformDefaults, setAllowUsePlatformDefaults] = useState(
    institutionPolicy.allowUsePlatformDefaults,
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const adminChanged = allowAdminEdit !== institutionPolicy.allowAdminEdit;
  const childChanged =
    allowChildOverride !== institutionPolicy.allowChildOverride;
  const platformChanged =
    allowUsePlatformDefaults !== institutionPolicy.allowUsePlatformDefaults;
  const hasChanges = adminChanged || childChanged || platformChanged;

  const canSave =
    caps.canToggleAllowAdminEdit ||
    caps.canToggleAllowChildOverride ||
    caps.canToggleAllowPlatformDefaults;

  if (!canSave && viewerRole !== "super_admin") {
    return null;
  }

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      if (adminChanged) {
        const res = await setInstitutionAiConfigLocksAction({
          institutionId,
          lock: "allow_admin_edit",
          enabled: allowAdminEdit,
        });
        if (!res.ok) {
          setError(res.error ?? "Failed to save");
          return;
        }
      }
      if (platformChanged) {
        const res = await setInstitutionAiConfigLocksAction({
          institutionId,
          lock: "allow_use_platform_defaults",
          enabled: allowUsePlatformDefaults,
        });
        if (!res.ok) {
          setError(res.error ?? "Failed to save");
          return;
        }
      }
      if (childChanged) {
        const res = await setInstitutionAiConfigLocksAction({
          institutionId,
          lock: "allow_child_override",
          enabled: allowChildOverride,
        });
        if (!res.ok) {
          setError(res.error ?? "Failed to save");
          return;
        }
      }
      invalidateAiConfigCache("institution", institutionId);
    });
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <p className="text-sm font-medium">AI configuration permissions</p>
      {caps.canToggleAllowPlatformDefaults && (
        <div className="flex items-center justify-between gap-4">
          <Label className="text-sm font-normal">
            Allow institution to use platform defaults
          </Label>
          <Switch
            checked={allowUsePlatformDefaults}
            onCheckedChange={setAllowUsePlatformDefaults}
            disabled={pending}
          />
        </div>
      )}
      {caps.canToggleAllowAdminEdit && (
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
      )}
      {(caps.canToggleAllowChildOverride || viewerRole === "super_admin") && (
        <div className="flex items-center justify-between gap-4">
          <Label className="text-sm font-normal">
            Allow classes to override
          </Label>
          <Switch
            checked={allowChildOverride}
            onCheckedChange={setAllowChildOverride}
            disabled={!caps.canToggleAllowChildOverride || pending}
          />
        </div>
      )}
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
