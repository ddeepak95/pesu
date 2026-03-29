"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DynamicQuestionSection } from "@/components/Teacher/Assignments/DynamicQuestionSection";
import type { DynamicGenerationSpec } from "@/types/assignment";

interface FileSubmissionSectionProps {
  fileSubmissionEnabled: boolean;
  setFileSubmissionEnabled: (enabled: boolean) => void;
  fileAllowMultiple: boolean;
  setFileAllowMultiple: (allow: boolean) => void;
  fileInstructions: string;
  setFileInstructions: (instructions: string) => void;
  loading: boolean;
  dynamicQuestionsEnabled: boolean;
  setDynamicQuestionsEnabled: (enabled: boolean) => void;
  dynamicGenerationSpec: DynamicGenerationSpec;
  setDynamicGenerationSpec: (spec: DynamicGenerationSpec) => void;
}

export function FileSubmissionSection({
  fileSubmissionEnabled,
  setFileSubmissionEnabled,
  fileAllowMultiple,
  setFileAllowMultiple,
  fileInstructions,
  setFileInstructions,
  loading,
  dynamicQuestionsEnabled,
  setDynamicQuestionsEnabled,
  dynamicGenerationSpec,
  setDynamicGenerationSpec,
}: FileSubmissionSectionProps) {
  return (
    <div className="space-y-3 p-4 border rounded-md">
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
            <Label htmlFor="fileInstructions" className="text-sm font-medium">
              Instructions for file submission (optional)
            </Label>
            <Textarea
              id="fileInstructions"
              value={fileInstructions}
              onChange={(e) => setFileInstructions(e.target.value)}
              disabled={loading}
              placeholder="e.g., Upload your report as a PDF file..."
              rows={2}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Only PDF files are accepted.
          </p>

          <div className="pt-4 mt-4 border-t border-border/80">
            <DynamicQuestionSection
              enabled={dynamicQuestionsEnabled}
              setEnabled={setDynamicQuestionsEnabled}
              spec={dynamicGenerationSpec}
              setSpec={setDynamicGenerationSpec}
              loading={loading}
            />
          </div>
        </div>
      )}
    </div>
  );
}
