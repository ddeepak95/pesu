"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  onActivate: (apiKey: string) => void;
  onDeactivate: () => void;
  onUsePlatformChange: (usePlatform: boolean) => void;
}

export default function AiProviderCard({
  provider,
  scope,
  activation,
  allowUsePlatformDefaults = true,
  allowUseInstitutionDefault = true,
  onActivate,
  onDeactivate,
  onUsePlatformChange,
}: AiProviderCardProps) {
  const [draftKey, setDraftKey] = useState("");

  const showUsePlatformToggle =
    scope === "class"
      ? allowUseInstitutionDefault
      : scope === "institution" && allowUsePlatformDefaults;
  const usingParent = showUsePlatformToggle && activation.usePlatformDefault;
  const isActive = activation.isActive && !usingParent;
  const parentLabel = scope === "class" ? "institution" : "platform";

  return (
    <div className="w-full rounded-lg border p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h4 className="font-medium">{provider.label}</h4>
          <p className="text-sm text-muted-foreground">{provider.description}</p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs ${
            usingParent
              ? "border-transparent bg-secondary text-secondary-foreground"
              : isActive
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "border-transparent bg-muted text-muted-foreground"
          }`}
        >
          {usingParent
            ? `Using ${parentLabel} key`
            : isActive
              ? "Active"
              : "Inactive"}
        </span>
      </div>

      {scope === "class" && !allowUseInstitutionDefault && (
        <p className="text-xs text-muted-foreground">
          Institution AI access is off for this class — set your own{" "}
          {provider.label} key below to use this provider.
        </p>
      )}

      {showUsePlatformToggle && (
        <div className="flex items-center justify-between gap-4 rounded-md bg-muted/40 px-3 py-2">
          <Label
            htmlFor={`use-platform-${provider.id}`}
            className="text-sm font-normal"
          >
            Use {parentLabel} {provider.label} key
          </Label>
          <Switch
            id={`use-platform-${provider.id}`}
            checked={activation.usePlatformDefault}
            onCheckedChange={onUsePlatformChange}
          />
        </div>
      )}

      {!usingParent && (
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
            disabled={provider.comingSoon}
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
              disabled={!draftKey.trim() || provider.comingSoon}
              onClick={() => {
                onActivate(draftKey);
                setDraftKey("");
              }}
            >
              {isActive ? "Update key" : "Activate"}
            </Button>
            {isActive && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  onDeactivate();
                  setDraftKey("");
                }}
              >
                Deactivate
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
