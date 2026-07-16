"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { invalidateAiCatalogCache } from "@/hooks/swr/useAiCatalogSettings";
import { invalidateClassAiOverride } from "@/hooks/swr/useClassAiOverride";
import { setClassAiOverrideAction } from "@/lib/ai/credentials/actions";
import type { AiConfigSection } from "@/lib/ai/credentials/capabilities";
import type { ViewerRole } from "@/lib/settings/capabilities";
import type { AiClassOverridePolicy, AiInstitutionPolicy } from "@/types/aiSettings";

interface ClassAiOverrideRowProps {
  classDbId: string;
  classShortId?: string | null;
  viewerRole: ViewerRole;
  institutionPolicy: AiInstitutionPolicy;
  classOverridePolicy: AiClassOverridePolicy;
  section: AiConfigSection;
}

const SECTION_LABEL: Record<AiConfigSection, string> = {
  providers: "Allow this class's teachers to edit providers",
  functions: "Allow this class's teachers to edit model selections",
};

const SECTION_LOCKED_HINT: Record<AiConfigSection, string> = {
  providers:
    "Enable “Allow institution admin to edit providers” for this institution first.",
  functions:
    "Enable “Allow institution admin to edit model selections” for this institution first.",
};

const SECTION_OVERRIDE_FIELD: Record<
  AiConfigSection,
  "allowChildOverrideProviders" | "allowChildOverrideFunctions"
> = {
  providers: "allowChildOverrideProviders",
  functions: "allowChildOverrideFunctions",
};

const SECTION_ADMIN_EDIT_FIELD: Record<
  AiConfigSection,
  "allowAdminEditProviders" | "allowAdminEditFunctions"
> = {
  providers: "allowAdminEditProviders",
  functions: "allowAdminEditFunctions",
};

export default function ClassAiOverrideRow({
  classDbId,
  classShortId,
  viewerRole,
  institutionPolicy,
  classOverridePolicy,
  section,
}: ClassAiOverrideRowProps) {
  const overrideField = SECTION_OVERRIDE_FIELD[section];
  const [allow, setAllow] = useState(classOverridePolicy[overrideField]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (viewerRole !== "institution_admin" && viewerRole !== "super_admin") {
    return null;
  }

  const changed = allow !== classOverridePolicy[overrideField];
  const locked = !institutionPolicy[SECTION_ADMIN_EDIT_FIELD[section]];

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const res = await setClassAiOverrideAction({
        classDbId,
        classShortId,
        section,
        enabled: allow,
      });
      if (!res.ok) {
        setError(res.error ?? "Failed to save");
        return;
      }
      if (!allow) {
        invalidateAiCatalogCache("class", classDbId);
      }
      invalidateClassAiOverride(classDbId);
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
