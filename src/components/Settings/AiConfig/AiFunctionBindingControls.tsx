"use client";

import { useState } from "react";
import { Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatReasoningLabel,
  getProviderEntry,
  modelHasReasoningConfig,
  modelsEligibleForFunction,
  normalizeFunctionBinding,
} from "@/lib/ai/catalog/helpers";
import type {
  AiSettingsScope,
  FunctionBindingState,
  LocalAiSettingsState,
  SavedModelReasoningConfig,
} from "@/lib/ai/catalog/types";

import AiModelConfigureDialog from "./AiModelConfigureDialog";

interface AiFunctionBindingControlsProps {
  parentFnKey: string;
  scope: AiSettingsScope;
  state: LocalAiSettingsState;
  binding: FunctionBindingState | undefined;
  canEdit?: boolean;
  onBindingChange: (binding: FunctionBindingState) => void;
}

export default function AiFunctionBindingControls({
  parentFnKey,
  scope,
  state,
  binding,
  canEdit = true,
  onBindingChange,
}: AiFunctionBindingControlsProps) {
  const [configureOpen, setConfigureOpen] = useState(false);

  const eligible = modelsEligibleForFunction(parentFnKey, state, scope);

  const providers = [...new Set(eligible.map((m) => m.providerId))];
  const selectedProvider = binding?.providerId ?? "";
  const selectedModel = binding?.modelId ?? "";
  const modelsForProvider = selectedProvider
    ? eligible.filter((m) => m.providerId === selectedProvider)
    : [];
  const hasSelectedModel = Boolean(selectedProvider && selectedModel);
  const normalizedBinding =
    selectedProvider && selectedModel
      ? normalizeFunctionBinding({
          providerId: selectedProvider,
          modelId: selectedModel,
          ...binding,
        })
      : undefined;
  const canConfigure = Boolean(
    hasSelectedModel && modelHasReasoningConfig(selectedModel),
  );
  const reasoningLabel = normalizedBinding
    ? formatReasoningLabel(normalizedBinding)
    : null;

  const commitBinding = (next: FunctionBindingState) => {
    onBindingChange(normalizeFunctionBinding(next));
  };

  const openConfigure = () => {
    if (!canConfigure) return;
    setConfigureOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Provider</Label>
          <Select
            value={selectedProvider || undefined}
            onValueChange={(providerId) => {
              setConfigureOpen(false);
              commitBinding({
                providerId: providerId as FunctionBindingState["providerId"],
                modelId: "",
              });
            }}
            disabled={eligible.length === 0 || !canEdit}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              {providers.map((id) => (
                <SelectItem key={id} value={id}>
                  {getProviderEntry(id)?.label ?? id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Model</Label>
          <div className="flex gap-2">
            <Select
              value={selectedModel || undefined}
              onValueChange={(modelId) => {
                if (!selectedProvider) return;
                commitBinding({
                  providerId: selectedProvider,
                  modelId,
                });
              }}
              disabled={
                !selectedProvider || modelsForProvider.length === 0 || !canEdit
              }
            >
              <SelectTrigger className="min-w-0 flex-1">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {modelsForProvider.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0 gap-1.5 px-2.5"
              disabled={!canConfigure || !canEdit}
              aria-disabled={!canConfigure || !canEdit}
              onClick={openConfigure}
            >
              <Settings className="h-3.5 w-3.5" />
              Configure
            </Button>
          </div>
          {canConfigure && reasoningLabel && (
            <p className="text-xs text-muted-foreground">
              Reasoning: {reasoningLabel}
            </p>
          )}
        </div>
      </div>

      {hasSelectedModel && (
        <AiModelConfigureDialog
          open={configureOpen && canConfigure}
          onOpenChange={(open) => {
            if (open && !canConfigure) return;
            setConfigureOpen(open);
          }}
          modelId={selectedModel}
          reasoning={normalizedBinding?.reasoning}
          onSave={(reasoning: SavedModelReasoningConfig) => {
            if (!selectedProvider || !selectedModel) return;
            commitBinding({
              providerId: selectedProvider,
              modelId: selectedModel,
              reasoning,
            });
          }}
        />
      )}

    </div>
  );
}
