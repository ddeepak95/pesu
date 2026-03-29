"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DynamicGenerationSpec } from "@/types/assignment";

interface DynamicQuestionSectionProps {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  spec: DynamicGenerationSpec;
  setSpec: (spec: DynamicGenerationSpec) => void;
  loading: boolean;
}

export function DynamicQuestionSection({
  enabled,
  setEnabled,
  spec,
  setSpec,
  loading,
}: DynamicQuestionSectionProps) {
  const totalPoints = spec.question_count * spec.points_per_question;

  return (
    <div className="space-y-3">
      <div className="flex items-center space-x-2">
        <Checkbox
          id="dynamicQuestionsEnabled"
          checked={enabled}
          onCheckedChange={(checked) => setEnabled(checked === true)}
          disabled={loading}
        />
        <div className="flex items-center gap-1.5">
          <Label
            htmlFor="dynamicQuestionsEnabled"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            Generate Questions and Rubric Dynamically
          </Label>
          <InfoTooltip text="Questions, rubrics, and expected answers will be generated for each student after they upload files, using the settings below." />
        </div>
      </div>

      {enabled && (
        <div className="space-y-4 pl-6">
          <p className="text-xs text-muted-foreground">
            Specify how many questions to create, how many points each is worth,
            and what topics or skills they should target. Each question is built
            from the student&apos;s uploaded files.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label
                htmlFor="dynamicQuestionCount"
                className="text-sm font-medium"
              >
                Number of questions
              </Label>
              <Input
                id="dynamicQuestionCount"
                type="number"
                min={1}
                value={spec.question_count || ""}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setSpec({
                    ...spec,
                    question_count: Number.isFinite(n) && n >= 1 ? n : 1,
                  });
                }}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="dynamicPointsPerQuestion"
                className="text-sm font-medium"
              >
                Points per question
              </Label>
              <Input
                id="dynamicPointsPerQuestion"
                type="number"
                min={1}
                value={spec.points_per_question || ""}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setSpec({
                    ...spec,
                    points_per_question: Number.isFinite(n) && n >= 1 ? n : 1,
                  });
                }}
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="dynamicCoverage" className="text-sm font-medium">
                What should the questions cover?
              </Label>
              <InfoTooltip text="Describe what the questions should cover in detail. In addition to the larger goals, you can also specifically describe what each question should cover." />
            </div>
            <Textarea
              id="dynamicCoverage"
              value={spec.coverage_description}
              onChange={(e) =>
                setSpec({ ...spec, coverage_description: e.target.value })
              }
              disabled={loading}
              placeholder="e.g., Critical analysis of the main argument, use of evidence, and clarity of conclusions..."
              rows={4}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Total points:{" "}
            <span className="font-medium tabular-nums">{totalPoints}</span>
          </p>
        </div>
      )}
    </div>
  );
}
