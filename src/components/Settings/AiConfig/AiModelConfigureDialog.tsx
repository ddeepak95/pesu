"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GOOGLE_THINKING_LEVEL_OPTIONS,
  OPENAI_REASONING_EFFORT_OPTIONS,
} from "@/lib/ai/catalog/data";
import {
  coerceReasoningForModel,
  getModelEntry,
  getModelReasoningCapabilities,
} from "@/lib/ai/catalog/helpers";
import type {
  GoogleThinkingLevel,
  OpenAiReasoningEffort,
  SavedModelReasoningConfig,
} from "@/lib/ai/catalog/types";

interface AiModelConfigureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelId: string;
  reasoning: SavedModelReasoningConfig | undefined;
  onSave: (reasoning: SavedModelReasoningConfig) => void;
}

function reasoningSeedKey(
  modelId: string,
  reasoning: SavedModelReasoningConfig | undefined,
): string {
  if (!reasoning) return `${modelId}:none`;
  if (reasoning.kind === "google") {
    return `${modelId}:google:${reasoning.thinkingLevel}`;
  }
  return `${modelId}:openai:${reasoning.reasoningEffort}`;
}

interface AiModelConfigureDialogFormProps {
  modelId: string;
  reasoning: SavedModelReasoningConfig | undefined;
  onSave: (reasoning: SavedModelReasoningConfig) => void;
  onCancel: () => void;
}

function AiModelConfigureDialogForm({
  modelId,
  reasoning,
  onSave,
  onCancel,
}: AiModelConfigureDialogFormProps) {
  const catalogCaps = getModelReasoningCapabilities(modelId);
  const [draft, setDraft] = useState<SavedModelReasoningConfig | undefined>(
    () => coerceReasoningForModel(modelId, reasoning),
  );

  const hasReasoning =
    catalogCaps &&
    ((catalogCaps.kind === "google" && catalogCaps.levels.length > 0) ||
      (catalogCaps.kind === "openai" && catalogCaps.efforts.length > 0));

  const googleOptions =
    catalogCaps?.kind === "google"
      ? GOOGLE_THINKING_LEVEL_OPTIONS.filter((o) =>
          catalogCaps.levels.includes(o.value),
        )
      : [];

  const openAiOptions =
    catalogCaps?.kind === "openai"
      ? OPENAI_REASONING_EFFORT_OPTIONS.filter((o) =>
          catalogCaps.efforts.includes(o.value),
        )
      : [];

  const handleSave = () => {
    const next = coerceReasoningForModel(modelId, draft);
    if (!next) return;
    onSave(next);
    onCancel();
  };

  return (
    <>
      <div className="space-y-6 py-2">
        {hasReasoning && draft?.kind === "google" && (
          <section className="space-y-2">
            <Label>Reasoning</Label>
            <Select
              value={draft.thinkingLevel}
              onValueChange={(value) =>
                setDraft({
                  kind: "google",
                  availableLevels:
                    catalogCaps?.kind === "google"
                      ? [...catalogCaps.levels]
                      : [],
                  thinkingLevel: value as GoogleThinkingLevel,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select reasoning level" />
              </SelectTrigger>
              <SelectContent>
                {googleOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {
                googleOptions.find((o) => o.value === draft.thinkingLevel)
                  ?.description
              }
            </p>
            <p className="text-xs text-muted-foreground">
              Available for this model:{" "}
              {googleOptions.map((o) => o.label).join(", ")}
            </p>
          </section>
        )}

        {hasReasoning && draft?.kind === "openai" && (
          <section className="space-y-2">
            <Label>Reasoning</Label>
            <Select
              value={draft.reasoningEffort}
              onValueChange={(value) =>
                setDraft({
                  kind: "openai",
                  availableEfforts:
                    catalogCaps?.kind === "openai"
                      ? [...catalogCaps.efforts]
                      : [],
                  reasoningEffort: value as OpenAiReasoningEffort,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select reasoning effort" />
              </SelectTrigger>
              <SelectContent>
                {openAiOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {
                openAiOptions.find((o) => o.value === draft.reasoningEffort)
                  ?.description
              }
            </p>
            <p className="text-xs text-muted-foreground">
              Available for this model:{" "}
              {openAiOptions.map((o) => o.label).join(", ")}
            </p>
          </section>
        )}

        {!hasReasoning && (
          <p className="text-sm text-muted-foreground">
            This model has no configurable options yet.
          </p>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSave} disabled={!hasReasoning || !draft}>
          Save
        </Button>
      </DialogFooter>
    </>
  );
}

export default function AiModelConfigureDialog({
  open,
  onOpenChange,
  modelId,
  reasoning,
  onSave,
}: AiModelConfigureDialogProps) {
  const model = getModelEntry(modelId);
  const formKey = reasoningSeedKey(modelId, reasoning);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configure model</DialogTitle>
          <DialogDescription>
            {model
              ? `Options for ${model.label}. Additional settings can be added here later.`
              : "Model configuration."}
          </DialogDescription>
        </DialogHeader>

        {open ? (
          <AiModelConfigureDialogForm
            key={formKey}
            modelId={modelId}
            reasoning={reasoning}
            onSave={onSave}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
