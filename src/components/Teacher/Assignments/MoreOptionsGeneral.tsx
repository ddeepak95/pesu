"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  AssignmentIntegritySettings,
  type AssignmentIntegritySettingsValues,
} from "@/components/Shared/Integrity/AssignmentIntegritySettings";
import { supportedLanguages } from "@/utils/supportedLanguages";
import { ResponderFieldConfig } from "@/types/assignment";
import { Trash2, Plus } from "lucide-react";

interface MoreOptionsGeneralProps {
  preferredLanguage: string;
  setPreferredLanguage: (lang: string) => void;
  lockLanguage: boolean;
  setLockLanguage: (lock: boolean) => void;
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
  integritySettings: AssignmentIntegritySettingsValues;
  setIntegritySettings: (settings: AssignmentIntegritySettingsValues) => void;
  isPublic: boolean;
  setIsPublic: (isPublic: boolean) => void;
  responderFieldsConfig: ResponderFieldConfig[];
  setResponderFieldsConfig: (config: ResponderFieldConfig[]) => void;
  loading: boolean;
}

export function MoreOptionsGeneral({
  preferredLanguage,
  setPreferredLanguage,
  lockLanguage,
  setLockLanguage,
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
  integritySettings,
  setIntegritySettings,
  isPublic,
  setIsPublic,
  responderFieldsConfig,
  setResponderFieldsConfig,
  loading,
}: MoreOptionsGeneralProps) {
  return (
    <div className="space-y-4">
      {/* Language Settings */}
      <div className="space-y-3 p-4 border rounded-md">
        <Label className="text-sm font-medium">Language Settings</Label>

        <div className="space-y-2">
          <Label htmlFor="preferredLanguage">Preferred Language</Label>
          <Select
            value={preferredLanguage}
            onValueChange={setPreferredLanguage}
            disabled={loading}
          >
            <SelectTrigger id="preferredLanguage">
              <SelectValue placeholder="Select a language" />
            </SelectTrigger>
            <SelectContent>
              {supportedLanguages.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="lockLanguage"
            checked={lockLanguage}
            onCheckedChange={(checked) => setLockLanguage(checked === true)}
            disabled={loading}
          />
          <div className="space-y-1">
            <Label
              htmlFor="lockLanguage"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Lock language for students
            </Label>
            <p className="text-sm text-muted-foreground">
              When enabled, students cannot change the interaction language
              during the assessment
            </p>
          </div>
        </div>
      </div>

      {/* Attempts & Completion */}
      <div className="space-y-3 p-4 border rounded-md">
        <Label className="text-sm font-medium">Attempts &amp; Completion</Label>

        <div className="space-y-2">
          <Label htmlFor="maxAttempts">Maximum Attempts</Label>
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
            disabled={loading}
            placeholder="3"
          />
          <p className="text-sm text-muted-foreground">
            Number of attempts students can make for this assignment. Default is
            3.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="requireAllAttempts"
            checked={requireAllAttempts}
            onCheckedChange={(checked) =>
              setRequireAllAttempts(checked === true)
            }
            disabled={loading}
          />
          <div className="space-y-1">
            <Label
              htmlFor="requireAllAttempts"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Require all questions attempted to complete
            </Label>
            <p className="text-sm text-muted-foreground">
              When enabled, students must attempt all questions before they can
              mark the assessment as complete
            </p>
          </div>
        </div>
      </div>

      {/* Display Settings */}
      <div className="space-y-3 p-4 border rounded-md">
        <Label className="text-sm font-medium">Display Settings</Label>

        {/* Rubric Visibility */}
        <div className="space-y-3 p-3 border rounded-md">
          <Label className="text-xs font-medium text-muted-foreground">
            Rubric Visibility
          </Label>
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
              disabled={loading}
            />
            <div className="space-y-1">
              <Label
                htmlFor="showRubric"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Show rubric to students
              </Label>
              <p className="text-sm text-muted-foreground">
                When enabled, students can view the rubric criteria during the
                assessment
              </p>
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
                disabled={loading}
              />
              <div className="space-y-1">
                <Label
                  htmlFor="showRubricPoints"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Show point values
                </Label>
                <p className="text-sm text-muted-foreground">
                  When enabled, students can see how many points each rubric
                  item is worth
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Star Display */}
        <div className="space-y-3 p-3 border rounded-md">
          <Label className="text-xs font-medium text-muted-foreground">
            Student Score Display
          </Label>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="useStarDisplay"
              checked={useStarDisplay}
              onCheckedChange={(checked) =>
                setUseStarDisplay(checked === true)
              }
              disabled={loading}
            />
            <div className="space-y-1">
              <Label
                htmlFor="useStarDisplay"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Show scores as stars to students
              </Label>
              <p className="text-sm text-muted-foreground">
                When enabled, students see star ratings instead of point scores
              </p>
            </div>
          </div>

          {useStarDisplay && (
            <div className="ml-6 space-y-2">
              <Label htmlFor="starScale" className="text-sm">
                Star Scale
              </Label>
              <Input
                id="starScale"
                type="number"
                min="1"
                max="20"
                value={starScale}
                onChange={(e) => setStarScale(parseInt(e.target.value) || 5)}
                disabled={loading}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">
                Number of stars in the rating scale (e.g., 5 for a 5-star
                scale). Students will see scores converted to this star scale,
                while rubrics remain in points.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Student Experience */}
      <div className="space-y-3 p-4 border rounded-md">
        <Label className="text-sm font-medium">Student Experience</Label>

        {/* Experience Rating */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="experienceRatingEnabled"
              checked={experienceRatingEnabled}
              onCheckedChange={(checked) => {
                setExperienceRatingEnabled(checked === true);
                if (!checked) setExperienceRatingRequired(false);
              }}
              disabled={loading}
            />
            <div className="space-y-1">
              <Label
                htmlFor="experienceRatingEnabled"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Enable Experience Rating
              </Label>
              <p className="text-sm text-muted-foreground">
                Ask students to rate their experience on a 5-point scale when
                completing the assessment
              </p>
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
                disabled={loading}
              />
              <div className="space-y-1">
                <Label
                  htmlFor="experienceRatingRequired"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Require rating
                </Label>
                <p className="text-sm text-muted-foreground">
                  Students must provide a rating before completing (otherwise
                  they can skip)
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Feedback Approval */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="feedbackRequiresApproval"
            checked={feedbackRequiresApproval}
            onCheckedChange={(checked) =>
              setFeedbackRequiresApproval(checked === true)
            }
            disabled={loading}
          />
          <div className="space-y-1">
            <Label
              htmlFor="feedbackRequiresApproval"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Require teacher approval before showing feedback
            </Label>
            <p className="text-sm text-muted-foreground">
              When enabled, AI-generated feedback is held for your review. You
              can edit and approve it before students can see it
            </p>
          </div>
        </div>
      </div>

      {/* Assessment Integrity */}
      <AssignmentIntegritySettings
        values={integritySettings}
        onChange={setIntegritySettings}
        disabled={loading}
      />

      {/* Public Access Toggle */}
      <div className="flex items-center space-x-2 p-4 border rounded-md bg-muted/30">
        <Checkbox
          id="isPublic"
          checked={isPublic}
          onCheckedChange={(checked) => setIsPublic(checked === true)}
          disabled={loading}
        />
        <div className="space-y-1">
          <Label
            htmlFor="isPublic"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            Make this assignment publicly accessible
          </Label>
          <p className="text-sm text-muted-foreground">
            Anyone with the link can view and complete this assignment without
            logging in
          </p>
        </div>
      </div>

      {/* Responder Fields Configuration (only for public assignments) */}
      {isPublic && (
        <div className="space-y-4 p-4 border rounded-md">
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
                {responderFieldsConfig.length > 1 && (
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
                    disabled={loading}
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
                    disabled={loading}
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
                    disabled={loading}
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
                  disabled={loading}
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
                    disabled={loading}
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
                    disabled={loading}
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
                      disabled={loading}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}

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
            disabled={loading}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Field
          </Button>
        </div>
      )}
    </div>
  );
}
