"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { invalidateAiCatalogCache } from "@/hooks/swr/useAiCatalogSettings";
import { invalidateClassAiOverride } from "@/hooks/swr/useClassAiOverride";
import { setClassAiOverrideAction } from "@/lib/ai/credentials/actions";
import type { ViewerRole } from "@/lib/settings/capabilities";
import type { AiClassOverridePolicy, AiInstitutionPolicy } from "@/types/aiSettings";

interface ClassAiOverrideRowProps {
  classDbId: string;
  classShortId?: string | null;
  viewerRole: ViewerRole;
  institutionPolicy: AiInstitutionPolicy;
  classOverridePolicy: AiClassOverridePolicy;
}

export default function ClassAiOverrideRow({
  classDbId,
  classShortId,
  viewerRole,
  institutionPolicy,
  classOverridePolicy,
}: ClassAiOverrideRowProps) {
  const [allowChildOverride, setAllowChildOverride] = useState(
    classOverridePolicy.allowChildOverride,
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (viewerRole !== "institution_admin" && viewerRole !== "super_admin") {
    return null;
  }

  const changed = allowChildOverride !== classOverridePolicy.allowChildOverride;
  const locked = !institutionPolicy.allowAdminEdit;

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const res = await setClassAiOverrideAction({
        classDbId,
        classShortId,
        enabled: allowChildOverride,
      });
      if (!res.ok) {
        setError(res.error ?? "Failed to save");
        return;
      }
      invalidateClassAiOverride(classDbId);
      if (!allowChildOverride) {
        // Revoking permission resets the class's AI config server-side —
        // refresh the catalog panels so they show the reverted state.
        invalidateAiCatalogCache("class", classDbId);
      }
    });
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <p className="text-sm font-medium">Class AI configuration permissions</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <Label className="text-sm font-normal">
            Allow this class&apos;s teachers to edit AI configuration
          </Label>
          <Switch
            checked={allowChildOverride}
            onCheckedChange={setAllowChildOverride}
            disabled={locked || pending}
          />
        </div>
        {locked && (
          <p className="text-xs text-muted-foreground">
            Enable &ldquo;Allow institution admin to edit&rdquo; for this
            institution first.
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
