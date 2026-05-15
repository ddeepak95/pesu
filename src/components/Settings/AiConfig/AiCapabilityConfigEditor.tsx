"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AI_PROVIDERS,
  defaultModelIdForProvider,
  modelsForProvider,
  resolveAiProvider,
  resolveGoogleModelId,
  type AiCapabilityDefinition,
  type AiProvider,
  type GoogleModelId,
} from "@/lib/ai/capabilities/registry";

export interface AiCapabilityConfigEditorValues {
  provider: AiProvider;
  modelId: string;
  apiKey: string;
}

interface AiCapabilityConfigEditorProps {
  definition: AiCapabilityDefinition;
  values: AiCapabilityConfigEditorValues;
  onChange: (next: AiCapabilityConfigEditorValues) => void;
  disabled?: boolean;
  allowEmptyKey?: boolean;
  existingKeyHint?: string | null;
}

export default function AiCapabilityConfigEditor({
  definition,
  values,
  onChange,
  disabled = false,
  allowEmptyKey = false,
  existingKeyHint,
}: AiCapabilityConfigEditorProps) {
  const provider = resolveAiProvider(values.provider);
  const modelOptions = modelsForProvider(provider);
  const modelId = resolveGoogleModelId(
    values.modelId,
    defaultModelIdForProvider(provider, definition),
  ) as GoogleModelId;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Provider</Label>
          <Select
            value={provider}
            onValueChange={(v) => {
              const nextProvider = v as AiProvider;
              onChange({
                ...values,
                provider: nextProvider,
                modelId: defaultModelIdForProvider(nextProvider, definition),
              });
            }}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_PROVIDERS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Model</Label>
          <Select
            value={modelId}
            onValueChange={(v) =>
              onChange({
                ...values,
                provider,
                modelId: v,
              })
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>API key</Label>
        <Input
          type="password"
          autoComplete="off"
          value={values.apiKey}
          onChange={(e) => onChange({ ...values, provider, apiKey: e.target.value })}
          placeholder={
            allowEmptyKey && existingKeyHint
              ? `Leave blank to keep ••••${existingKeyHint}`
              : "Paste API key"
          }
          disabled={disabled}
        />
      </div>
    </div>
  );
}
