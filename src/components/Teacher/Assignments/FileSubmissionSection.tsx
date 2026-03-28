"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const ALLOWED_FILE_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".doc",
  ".txt",
  ".png",
  ".jpg",
  ".jpeg",
  ".xlsx",
  ".csv",
  ".pptx",
] as const;

interface FileSubmissionSectionProps {
  fileSubmissionEnabled: boolean;
  setFileSubmissionEnabled: (enabled: boolean) => void;
  fileAllowMultiple: boolean;
  setFileAllowMultiple: (allow: boolean) => void;
  fileInstructions: string;
  setFileInstructions: (instructions: string) => void;
  fileAllowedTypes: string[];
  setFileAllowedTypes: React.Dispatch<React.SetStateAction<string[]>>;
  loading: boolean;
}

export function FileSubmissionSection({
  fileSubmissionEnabled,
  setFileSubmissionEnabled,
  fileAllowMultiple,
  setFileAllowMultiple,
  fileInstructions,
  setFileInstructions,
  fileAllowedTypes,
  setFileAllowedTypes,
  loading,
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

          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Allowed file types (optional)
            </Label>
            <p className="text-xs text-muted-foreground">
              Leave empty to allow all file types. Click to toggle.
            </p>
            <div className="flex flex-wrap gap-2">
              {ALLOWED_FILE_EXTENSIONS.map((ext) => {
                const isSelected = fileAllowedTypes.includes(ext);
                return (
                  <button
                    key={ext}
                    type="button"
                    onClick={() => {
                      setFileAllowedTypes((prev) =>
                        isSelected
                          ? prev.filter((t) => t !== ext)
                          : [...prev, ext],
                      );
                    }}
                    disabled={loading}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-input hover:bg-muted"
                    }`}
                  >
                    {ext}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
