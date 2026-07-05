"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Label } from "@/components/ui/label";
import { SettingsCard } from "@/components/ui/settings-card";
import { Textarea } from "@/components/ui/textarea";
import {
  FILE_SUBMISSION_TYPE_OPTIONS,
} from "@/types/assignment";

interface FileSubmissionSectionProps {
  fileSubmissionEnabled: boolean;
  setFileSubmissionEnabled: (enabled: boolean) => void;
  fileAllowMultiple: boolean;
  setFileAllowMultiple: (allow: boolean) => void;
  fileAllowedTypes: string[];
  onToggleAllowedFileType: (ext: string, selected: boolean) => void;
  fileInstructions: string;
  setFileInstructions: (instructions: string) => void;
  loading: boolean;
  /** View-mode display: the instructions textarea skips the dimmed/disabled look. */
  readOnly?: boolean;
}

export function FileSubmissionSection({
  fileSubmissionEnabled,
  setFileSubmissionEnabled,
  fileAllowMultiple,
  setFileAllowMultiple,
  fileAllowedTypes,
  onToggleAllowedFileType,
  fileInstructions,
  setFileInstructions,
  loading,
  readOnly = false,
}: FileSubmissionSectionProps) {
  const isOnlySelectedPdf =
    fileAllowedTypes.length === 1 && fileAllowedTypes[0] === ".pdf";

  return (
    <SettingsCard className="space-y-3">
      <div className="flex items-center space-x-2">
        <Checkbox
          id="fileSubmissionEnabled"
          checked={fileSubmissionEnabled}
          onCheckedChange={(checked) => {
            setFileSubmissionEnabled(checked === true);
          }}
          disabled={loading}
        />
        <div className="flex items-center gap-1.5">
          <Label
            htmlFor="fileSubmissionEnabled"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            Require File Submission
          </Label>
          <InfoTooltip text="Students must upload files before answering questions. The file content will be included in the prompt for the AI to use." />
        </div>
      </div>

      {fileSubmissionEnabled && (
        <div className="space-y-4 ml-6">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="fileAllowMultiple"
              checked={fileAllowMultiple}
              onCheckedChange={(checked) =>
                setFileAllowMultiple(checked === true)
              }
              disabled={loading}
            />
            <Label
              htmlFor="fileAllowMultiple"
              className="text-sm font-medium leading-none cursor-pointer"
            >
              Allow multiple files
            </Label>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Acceptable file types
            </Label>
            <div className="flex flex-wrap gap-2">
              {FILE_SUBMISSION_TYPE_OPTIONS.map(({ ext }) => {
                const selected = fileAllowedTypes.includes(ext);
                const disableUncheckPdf =
                  ext === ".pdf" && selected && isOnlySelectedPdf;

                return (
                  <Button
                    key={ext}
                    type="button"
                    variant={selected ? "default" : "outline"}
                    size="sm"
                    disabled={loading || disableUncheckPdf}
                    aria-pressed={selected}
                    aria-label={ext}
                    className="rounded-full h-8 min-w-[2.75rem] px-3 font-mono text-xs font-medium tabular-nums shadow-none"
                    onClick={() =>
                      onToggleAllowedFileType(ext, !selected)
                    }
                  >
                    {ext}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fileInstructions" className="text-sm font-medium">
              Instructions for file submission (optional)
            </Label>
            <Textarea
              id="fileInstructions"
              value={fileInstructions}
              onChange={(e) => setFileInstructions(e.target.value)}
              disabled={loading}
              readOnly={readOnly}
              placeholder="e.g., Upload your report as PDF, or your solution as a .py file..."
              rows={2}
            />
          </div>

          <p className="text-xs text-muted-foreground pt-2 border-t border-border/80">
            Per-question <span className="font-medium">Dynamic</span> toggles
            for the question and/or rubric appear on each question card below.
          </p>
        </div>
      )}
    </SettingsCard>
  );
}
