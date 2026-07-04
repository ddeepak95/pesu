"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsCard } from "@/components/ui/settings-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AssignmentIntegritySettings,
  type AssignmentIntegritySettingsValues,
} from "@/components/Shared/Integrity/AssignmentIntegritySettings";
import { FileSubmissionSection } from "@/components/Teacher/Assignments/FileSubmissionSection";
import { ResponderFieldConfig } from "@/types/assignment";
import { Trash2, Plus } from "lucide-react";

interface MoreOptionsGeneralProps {
  maxAttempts: number;
  setMaxAttempts: (attempts: number) => void;
  requireAllAttempts: boolean;
  setRequireAllAttempts: (require: boolean) => void;
  showRubric: boolean;
  setShowRubric: (show: boolean) => void;
  showRubricPoints: boolean;
  setShowRubricPoints: (show: boolean) => void;
  useStarDisplay: boolean;
  setUseStarDisplay: (use: boolean) => void;
  starScale: number;
  setStarScale: (scale: number) => void;
  experienceRatingEnabled: boolean;
  setExperienceRatingEnabled: (enabled: boolean) => void;
  experienceRatingRequired: boolean;
  setExperienceRatingRequired: (required: boolean) => void;
  feedbackRequiresApproval: boolean;
  setFeedbackRequiresApproval: (requires: boolean) => void;
  batchGradeRelease: boolean;
  setBatchGradeRelease: (batch: boolean) => void;
  integritySettings: AssignmentIntegritySettingsValues;
  setIntegritySettings: (settings: AssignmentIntegritySettingsValues) => void;
  isPublic: boolean;
  setIsPublic: (isPublic: boolean) => void;
  responderFieldsConfig: ResponderFieldConfig[];
  setResponderFieldsConfig: (config: ResponderFieldConfig[]) => void;
  fileSubmissionEnabled: boolean;
  setFileSubmissionEnabled: (enabled: boolean) => void;
  fileAllowMultiple: boolean;
  setFileAllowMultiple: (allow: boolean) => void;
  fileAllowedTypes: string[];
  onToggleAllowedFileType: (ext: string, selected: boolean) => void;
  fileInstructions: string;
  setFileInstructions: (instructions: string) => void;
  loading: boolean;
  /** Hides add/remove-field actions entirely (view mode) rather than just disabling them. */
  readOnly?: boolean;
}

export function MoreOptionsGeneral({
  maxAttempts,
  setMaxAttempts,
  requireAllAttempts,
  setRequireAllAttempts,
  showRubric,
  setShowRubric,
  showRubricPoints,
  setShowRubricPoints,
  useStarDisplay,
  setUseStarDisplay,
  starScale,
  setStarScale,
  experienceRatingEnabled,
  setExperienceRatingEnabled,
  experienceRatingRequired,
  setExperienceRatingRequired,
  feedbackRequiresApproval,
  setFeedbackRequiresApproval,
  batchGradeRelease,
  setBatchGradeRelease,
  integritySettings,
  setIntegritySettings,
  isPublic,
  setIsPublic,
  responderFieldsConfig,
  setResponderFieldsConfig,
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
}: MoreOptionsGeneralProps) {
  const effectiveDisabled = loading || readOnly;
  return (
    <div className="space-y-4">
      {/* Require File Submission */}
      <FileSubmissionSection
        fileSubmissionEnabled={fileSubmissionEnabled}
        setFileSubmissionEnabled={setFileSubmissionEnabled}
        fileAllowMultiple={fileAllowMultiple}
        setFileAllowMultiple={setFileAllowMultiple}
        fileAllowedTypes={fileAllowedTypes}
        onToggleAllowedFileType={onToggleAllowedFileType}
        fileInstructions={fileInstructions}
        setFileInstructions={setFileInstructions}
        loading={effectiveDisabled}
      />

      {/* Attempts & Completion */}
      <SettingsCard className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="maxAttempts">Maximum Attempts</Label>
            <InfoTooltip text="Number of attempts students can make for this assignment. Default is 3." />
          </div>
          <Input
            id="maxAttempts"
            type="number"
            min="1"
            value={maxAttempts}
            onChange={(e) => {
              const value = parseInt(e.target.value, 10);
              if (!isNaN(value) && value >= 1) {
                setMaxAttempts(value);
              }
            }}
            disabled={effectiveDisabled}
            placeholder="3"
          />
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="requireAllAttempts"
            checked={requireAllAttempts}
            onCheckedChange={(checked) =>
              setRequireAllAttempts(checked === true)
            }
            disabled={effectiveDisabled}
          />
          <div className="flex items-center gap-1.5">
            <Label
              htmlFor="requireAllAttempts"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Require all questions attempted to complete
            </Label>
            <InfoTooltip text="When enabled, students must attempt all questions before they can mark the assessment as complete." />
          </div>
        </div>
      </SettingsCard>

      {/* Display Settings */}
      <SettingsCard className="space-y-3">
        <Label className="text-sm font-medium">Display Settings</Label>

        <div className="grid gap-3 md:grid-cols-2 md:items-start">
        {/* Rubric Visibility */}
        <div className="space-y-3 p-3 border rounded-md bg-muted/30">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="showRubric"
              checked={showRubric}
              onCheckedChange={(checked) => {
                setShowRubric(checked === true);
                if (!checked) {
                  setShowRubricPoints(false);
                }
              }}
              disabled={effectiveDisabled}
            />
            <div className="flex items-center gap-1.5">
              <Label
                htmlFor="showRubric"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Show rubric to students
              </Label>
              <InfoTooltip text="When enabled, students can view the rubric criteria during the assessment." />
            </div>
          </div>

          {showRubric && (
            <div className="flex items-center space-x-2 ml-6">
              <Checkbox
                id="showRubricPoints"
                checked={showRubricPoints}
                onCheckedChange={(checked) =>
                  setShowRubricPoints(checked === true)
                }
                disabled={effectiveDisabled}
              />
              <div className="flex items-center gap-1.5">
                <Label
                  htmlFor="showRubricPoints"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Show point values
                </Label>
                <InfoTooltip text="When enabled, students can see how many points each rubric item is worth." />
              </div>
            </div>
          )}
        </div>

        {/* Star Display */}
        <div className="space-y-3 p-3 border rounded-md bg-muted/30">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="useStarDisplay"
              checked={useStarDisplay}
              onCheckedChange={(checked) =>
                setUseStarDisplay(checked === true)
              }
              disabled={effectiveDisabled}
            />
            <div className="flex items-center gap-1.5">
              <Label
                htmlFor="useStarDisplay"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Show scores as stars to students
              </Label>
              <InfoTooltip text="When enabled, students see star ratings instead of point scores." />
            </div>
          </div>

          {useStarDisplay && (
            <div className="ml-6 space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="starScale" className="text-sm">
                  Star Scale
                </Label>
                <InfoTooltip text="Number of stars in the rating scale (e.g., 5 for a 5-star scale). Students will see scores converted to this star scale, while rubrics remain in points." />
              </div>
              <Input
                id="starScale"
                type="number"
                min="1"
                max="20"
                value={starScale}
                onChange={(e) => setStarScale(parseInt(e.target.value) || 5)}
                disabled={effectiveDisabled}
                className="w-32"
              />
            </div>
          )}
        </div>
        </div>
      </SettingsCard>

      {/* Student Experience */}
      <SettingsCard className="space-y-3">
        <Label className="text-sm font-medium">Student Experience</Label>

        <div className="grid gap-4 md:grid-cols-2 md:items-start">
        {/* Experience Rating */}
        <div className="space-y-3 p-3 border rounded-md bg-muted/30">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="experienceRatingEnabled"
              checked={experienceRatingEnabled}
              onCheckedChange={(checked) => {
                setExperienceRatingEnabled(checked === true);
                if (!checked) setExperienceRatingRequired(false);
              }}
              disabled={effectiveDisabled}
            />
            <div className="flex items-center gap-1.5">
              <Label
                htmlFor="experienceRatingEnabled"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Enable Experience Rating
              </Label>
              <InfoTooltip text="Ask students to rate their experience on a 5-point scale when completing the assessment." />
            </div>
          </div>

          {experienceRatingEnabled && (
            <div className="flex items-center space-x-2 ml-6">
              <Checkbox
                id="experienceRatingRequired"
                checked={experienceRatingRequired}
                onCheckedChange={(checked) =>
                  setExperienceRatingRequired(checked === true)
                }
                disabled={effectiveDisabled}
              />
              <div className="flex items-center gap-1.5">
                <Label
                  htmlFor="experienceRatingRequired"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Require rating
                </Label>
                <InfoTooltip text="Students must provide a rating before completing (otherwise they can skip)." />
              </div>
            </div>
          )}
        </div>

        {/* Feedback Approval */}
        <div className="space-y-3 p-3 border rounded-md bg-muted/30">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="feedbackRequiresApproval"
              checked={feedbackRequiresApproval}
              onCheckedChange={(checked) =>
                setFeedbackRequiresApproval(checked === true)
              }
              disabled={effectiveDisabled}
            />
            <div className="flex items-center gap-1.5">
              <Label
                htmlFor="feedbackRequiresApproval"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Require teacher approval before showing feedback
              </Label>
              <InfoTooltip text="When enabled, AI-generated feedback is held for your review. You can edit and approve it before students can see it." />
            </div>
          </div>

          {feedbackRequiresApproval && (
            <div className="ml-6 space-y-2">
              <div className="flex items-center gap-1.5">
                <Label className="text-sm">Release timing</Label>
                <InfoTooltip text="Choose whether each student sees their grade as soon as you finish grading it, or whether all grades stay hidden until you release the whole assignment at once." />
              </div>
              <Select
                value={batchGradeRelease ? "batch" : "per_submission"}
                onValueChange={(value) =>
                  setBatchGradeRelease(value === "batch")
                }
                disabled={effectiveDisabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_submission">
                    Release each student as I finish grading
                  </SelectItem>
                  <SelectItem value="batch">
                    Hold all grades, release together
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        </div>
      </SettingsCard>

      {/* Assessment Integrity */}
      <AssignmentIntegritySettings
        values={integritySettings}
        onChange={setIntegritySettings}
        disabled={effectiveDisabled}
      />

      {/* Public Access Toggle */}
      <SettingsCard className="flex items-center space-x-2">
        <Checkbox
          id="isPublic"
          checked={isPublic}
          onCheckedChange={(checked) => setIsPublic(checked === true)}
          disabled={effectiveDisabled}
        />
        <div className="flex items-center gap-1.5">
          <Label
            htmlFor="isPublic"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            Make this assignment publicly accessible
          </Label>
          <InfoTooltip text="Anyone with the link can view and complete this assignment without logging in." />
        </div>
      </SettingsCard>

      {/* Responder Fields Configuration (only for public assignments) */}
      {isPublic && (
        <SettingsCard className="space-y-4">
          <div className="space-y-2">
            <Label>Responder Information Fields</Label>
            <p className="text-sm text-muted-foreground">
              Configure what information to collect from public responders
            </p>
          </div>

          {responderFieldsConfig.map((field, index) => (
            <div key={index} className="p-4 border rounded-md space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Field {index + 1}
                </Label>
                {!readOnly && responderFieldsConfig.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const newFields = responderFieldsConfig.filter(
                        (_, i) => i !== index,
                      );
                      setResponderFieldsConfig(newFields);
                    }}
                    disabled={effectiveDisabled}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`field-${index}-label`}>Label</Label>
                  <Input
                    id={`field-${index}-label`}
                    value={field.label}
                    onChange={(e) => {
                      const newFields = [...responderFieldsConfig];
                      newFields[index].label = e.target.value;
                      setResponderFieldsConfig(newFields);
                    }}
                    placeholder="e.g., Full Name"
                    disabled={effectiveDisabled}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`field-${index}-type`}>Type</Label>
                  <Select
                    value={field.type}
                    onValueChange={(value) => {
                      const newFields = [...responderFieldsConfig];
                      newFields[index].type =
                        value as ResponderFieldConfig["type"];
                      if (value !== "select") {
                        delete newFields[index].options;
                      }
                      setResponderFieldsConfig(newFields);
                    }}
                    disabled={effectiveDisabled}
                  >
                    <SelectTrigger id={`field-${index}-type`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="tel">Phone</SelectItem>
                      <SelectItem value="select">
                        Select (Dropdown)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`field-${index}-field`}>
                  Field Identifier
                </Label>
                <Input
                  id={`field-${index}-field`}
                  value={field.field}
                  onChange={(e) => {
                    const newFields = [...responderFieldsConfig];
                    newFields[index].field = e.target.value;
                    setResponderFieldsConfig(newFields);
                  }}
                  placeholder="e.g., name, email, organization"
                  disabled={effectiveDisabled}
                />
                <p className="text-xs text-muted-foreground">
                  Unique identifier for this field (used in data storage)
                </p>
              </div>

              {field.type === "select" && (
                <div className="space-y-2">
                  <Label htmlFor={`field-${index}-options`}>
                    Options (one per line)
                  </Label>
                  <textarea
                    id={`field-${index}-options`}
                    className="w-full min-h-[80px] px-3 py-2 text-sm border rounded-md"
                    value={field.options?.join("\n") || ""}
                    onChange={(e) => {
                      const newFields = [...responderFieldsConfig];
                      newFields[index].options = e.target.value
                        .split("\n")
                        .map((line) => line.trim())
                        .filter((line) => line.length > 0);
                      setResponderFieldsConfig(newFields);
                    }}
                    placeholder="Option 1&#10;Option 2&#10;Option 3"
                    disabled={effectiveDisabled}
                  />
                </div>
              )}

              <div className="flex items-center gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id={`field-${index}-required`}
                    checked={field.required}
                    onCheckedChange={(checked) => {
                      const newFields = [...responderFieldsConfig];
                      newFields[index].required = checked === true;
                      setResponderFieldsConfig(newFields);
                    }}
                    disabled={effectiveDisabled}
                  />
                  <Label
                    htmlFor={`field-${index}-required`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    Required field
                  </Label>
                </div>

                {field.type !== "select" && (
                  <div className="flex-1 space-y-2">
                    <Label htmlFor={`field-${index}-placeholder`}>
                      Placeholder
                    </Label>
                    <Input
                      id={`field-${index}-placeholder`}
                      value={field.placeholder || ""}
                      onChange={(e) => {
                        const newFields = [...responderFieldsConfig];
                        newFields[index].placeholder = e.target.value;
                        setResponderFieldsConfig(newFields);
                      }}
                      placeholder="Optional placeholder text"
                      disabled={effectiveDisabled}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}

          {!readOnly && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const newField: ResponderFieldConfig = {
                  field: `field_${responderFieldsConfig.length + 1}`,
                  type: "text",
                  label: "",
                  required: false,
                };
                setResponderFieldsConfig([...responderFieldsConfig, newField]);
              }}
              disabled={effectiveDisabled}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Field
            </Button>
          )}
        </SettingsCard>
      )}
    </div>
  );
}
