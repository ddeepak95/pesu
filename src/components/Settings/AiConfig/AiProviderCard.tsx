"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  AiSettingsScope,
  ProviderActivationState,
  ProviderCatalogEntry,
} from "@/lib/ai/catalog/types";

interface AiProviderCardProps {
  provider: ProviderCatalogEntry;
  scope: AiSettingsScope;
  activation: ProviderActivationState;
  /** Whether this institution may fall back to the platform's key. Class scope is unaffected. */
  allowUsePlatformDefaults?: boolean;
  /** Whether this class may fall back to the institution's key (the class's AI-access toggle). Institution scope is unaffected. */
  allowUseInstitutionDefault?: boolean;
  /** Whether the viewer may edit provider config. When false, controls render read-only. */
  canEdit?: boolean;
  onActivate: (apiKey: string) => void;
  onDeactivate: () => void;
  onUsePlatformChange: (usePlatform: boolean) => void;
}

type ProviderMode = "off" | "credits" | "own_key";

export default function AiProviderCard({
  provider,
  scope,
  activation,
  allowUsePlatformDefaults = true,
  allowUseInstitutionDefault = true,
  canEdit = true,
  onActivate,
  onDeactivate,
  onUsePlatformChange,
}: AiProviderCardProps) {
  const [draftKey, setDraftKey] = useState("");

  const canUseCredits =
    scope === "class"
      ? allowUseInstitutionDefault
      : scope === "institution" && allowUsePlatformDefaults;
  const usingParent = canUseCredits && activation.usePlatformDefault;
  const isActive = activation.isActive && !usingParent;
  const parentLabel = scope === "class" ? "institution" : "platform";

  const derivedMode: ProviderMode = usingParent
    ? "credits"
    : isActive
      ? "own_key"
      : "off";
  const [keyEntryMode, setKeyEntryMode] = useState(derivedMode === "own_key");
  const mode: ProviderMode = keyEntryMode ? "own_key" : derivedMode;

  const handleModeChange = (next: ProviderMode) => {
    if (next === "own_key") {
      setKeyEntryMode(true);
      return;
    }
    setKeyEntryMode(false);
    if (next === "credits") {
      onUsePlatformChange(true);
      return;
    }
    if (scope === "platform") {
      onDeactivate();
    } else {
      onUsePlatformChange(false);
    }
  };

  return (
    <div className="w-full rounded-lg border p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-medium">{provider.label}</h4>
        <Select
          value={mode}
          onValueChange={(value) => handleModeChange(value as ProviderMode)}
          disabled={!canEdit}
        >
          <SelectTrigger
            id={`mode-${provider.id}`}
            className="w-auto min-w-[180px] shrink-0"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="off">Off</SelectItem>
            {canUseCredits && (
              <SelectItem value="credits">
                Use {parentLabel} AI credits
              </SelectItem>
            )}
            <SelectItem value="own_key">Use own API key</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {scope === "class" && !allowUseInstitutionDefault && (
        <p className="text-xs text-muted-foreground">
          Institution AI access is off for this class — set your own{" "}
          {provider.label} key below to use this provider.
        </p>
      )}

      {mode === "own_key" && (
        <div className="space-y-2">
          <Label htmlFor={`key-${provider.id}`}>{provider.activationLabel}</Label>
          <Input
            id={`key-${provider.id}`}
            type="password"
            placeholder={
              activation.keyHint
                ? `Saved ••••${activation.keyHint}`
                : "Paste API key"
            }
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            disabled={provider.comingSoon || !canEdit}
          />
          {provider.comingSoon && (
            <p className="text-xs text-muted-foreground">
              This provider cannot be activated yet.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!draftKey.trim() || provider.comingSoon || !canEdit}
              onClick={() => {
                onActivate(draftKey);
                setDraftKey("");
              }}
            >
              {isActive ? "Update key" : "Activate"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
