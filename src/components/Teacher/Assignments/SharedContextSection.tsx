"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Label } from "@/components/ui/label";
import { SettingsCard } from "@/components/ui/settings-card";
import { Textarea } from "@/components/ui/textarea";

interface SharedContextSectionProps {
  sharedContextEnabled: boolean;
  setSharedContextEnabled: (enabled: boolean) => void;
  sharedContext: string;
  setSharedContext: (context: string) => void;
  loading: boolean;
  /** View-mode display: the context textarea skips the dimmed/disabled look. */
  readOnly?: boolean;
}

export function SharedContextSection({
  sharedContextEnabled,
  setSharedContextEnabled,
  sharedContext,
  setSharedContext,
  loading,
  readOnly = false,
}: SharedContextSectionProps) {
  return (
    <SettingsCard className="space-y-3">
      <div className="flex items-center space-x-2">
        <Checkbox
          id="sharedContextEnabled"
          checked={sharedContextEnabled}
          onCheckedChange={(checked) =>
            setSharedContextEnabled(checked === true)
          }
          disabled={loading}
        />
        <div className="flex items-center gap-1.5">
          <Label
            htmlFor="sharedContextEnabled"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            Additional Contextual Information for AI
          </Label>
          <InfoTooltip text="AI performs best with more contextual information about the activity. This won't be shown to the students and will be included only in the prompt." />
        </div>
      </div>

      {sharedContextEnabled && (
        <div className="space-y-2 mt-3">
          <Label htmlFor="sharedContext">
            Context text <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="sharedContext"
            value={sharedContext}
            onChange={(e) => setSharedContext(e.target.value)}
            disabled={loading}
            readOnly={readOnly}
            placeholder="Enter additional context, case study, passage, or scenario..."
            rows={6}
            className="resize-y"
          />
        </div>
      )}
    </SettingsCard>
  );
}
