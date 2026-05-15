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
  type AiCapabilityDefinition,
  type AiProvider,
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
  const placeholder = definition.modelPlaceholders[values.provider];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Provider</Label>
          <Select
            value={values.provider}
            onValueChange={(v) =>
              onChange({
                ...values,
                provider: v as AiProvider,
                modelId: definition.modelPlaceholders[v as AiProvider],
              })
            }
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
          <Label>Model ID</Label>
          <Input
            value={values.modelId}
            onChange={(e) => onChange({ ...values, modelId: e.target.value })}
            placeholder={placeholder}
            disabled={disabled}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>API key</Label>
        <Input
          type="password"
          autoComplete="off"
          value={values.apiKey}
          onChange={(e) => onChange({ ...values, apiKey: e.target.value })}
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
