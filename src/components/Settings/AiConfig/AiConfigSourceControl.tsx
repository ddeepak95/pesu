"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface AiConfigSourceControlProps {
  mode: "institution" | "class";
  useCustom: boolean;
  onUseCustomChange: (useCustom: boolean) => void;
  disabled?: boolean;
}

export default function AiConfigSourceControl({
  mode,
  useCustom,
  onUseCustomChange,
  disabled = false,
}: AiConfigSourceControlProps) {
  const label =
    mode === "institution"
      ? "Use custom configuration (instead of platform default)"
      : "Override for this class";

  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={`ai-source-${mode}`} className="text-sm font-normal">
        {label}
      </Label>
      <Switch
        id={`ai-source-${mode}`}
        checked={useCustom}
        onCheckedChange={onUseCustomChange}
        disabled={disabled}
      />
    </div>
  );
}
