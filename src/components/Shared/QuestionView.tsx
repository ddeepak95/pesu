"use client";

import { Question, teacherPromptOrFocus } from "@/types/assignment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { getActivityTypeLabels } from "@/lib/activityTypes/registry";
import type { ActivityTypeKind } from "@/lib/activityTypes/types";

const DYNAMIC_QUESTION_BADGE_INFO =
  "Dynamic question: When on, each student's question is generated from their uploaded files and your guidelines for the question. Turn it off to write the exact question shown to everyone.";

const DYNAMIC_RUBRIC_BADGE_INFO =
  "Dynamic rubric: When on, the rubric and expected answer are generated per student from their files when they continue past the upload step, instead of the fixed rubric you edit here.";

interface QuestionViewProps {
  question: Question;
  index: number;
  /** When true, show Dynamic question / Dynamic rubric pills in the card header (e.g. teacher assignment detail). */
  showDynamicBadges?: boolean;
  showRubric?: boolean;
  showSupportingContent?: boolean;
  /** Activity type driving the UI labels (Question→Scenario, Rubric→Aspects to cover, …). */
  activityType?: ActivityTypeKind;
}

/**
 * Shared component for displaying assignment questions
 * Can be used by both teachers and students
 */
export default function QuestionView({
  question,
  index,
  showDynamicBadges = false,
  showRubric = false,
  showSupportingContent = true,
  activityType = "learning",
}: QuestionViewProps) {
  const labels = getActivityTypeLabels(activityType);
  const hasRubric =
    showRubric && question.rubric && question.rubric.length > 0;
  const expectedAnswer = question.expected_answer?.trim() ?? "";
  const hasExpectedAnswer = Boolean(expectedAnswer);
  const showCollapsible = hasRubric || hasExpectedAnswer;

  return (
    <Card>
      <CardHeader className="space-y-2">
        {showDynamicBadges &&
          (question.dynamic_prompt || question.dynamic_rubric) && (
            <div className="flex flex-wrap gap-2 justify-start text-xs">
              {question.dynamic_prompt && (
                <Pill purpose="dynamicQuestion" className="pl-2 pr-1">
                  <span>Dynamic question</span>
                  <InfoTooltip
                    text={DYNAMIC_QUESTION_BADGE_INFO}
                    iconClassName="h-3.5 w-3.5 text-current"
                    ariaLabel="About dynamic question"
                  />
                </Pill>
              )}
              {question.dynamic_rubric && (
                <Pill purpose="dynamicRubric" className="pl-2 pr-1">
                  <span>Dynamic rubric</span>
                  <InfoTooltip
                    text={DYNAMIC_RUBRIC_BADGE_INFO}
                    iconClassName="h-3.5 w-3.5 text-current"
                    ariaLabel="About dynamic rubric"
                  />
                </Pill>
              )}
            </div>
          )}
        <CardTitle className="text-sm">
          {labels.question} {index + 1} ({question.total_points} points)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="font-semibold text-sm text-muted-foreground mb-2">
            {question.dynamic_prompt
              ? "Guidelines for the question"
              : labels.question}
          </h4>
          <p className="whitespace-pre-wrap">
            {teacherPromptOrFocus(question)}
          </p>
        </div>

        {showCollapsible && (
          <Accordion
            type="multiple"
            defaultValue={[]}
            className="w-full rounded-md border px-2"
          >
            {hasRubric && (
              <AccordionItem
                value="rubric"
                className={!hasExpectedAnswer ? "border-b-0" : undefined}
              >
                <AccordionTrigger className="py-3 text-sm font-medium hover:no-underline">
                  {labels.rubric}
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 pb-2">
                    {(question.rubric ?? []).map((item, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between items-start gap-4 p-3 bg-muted/50 rounded-md"
                      >
                        <span className="flex-1">{item.item}</span>
                        <span className="font-semibold text-sm whitespace-nowrap">
                          {item.points} pts
                        </span>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
            {hasExpectedAnswer && (
              <AccordionItem value="expected" className="border-b-0">
                <AccordionTrigger className="py-3 text-sm font-medium hover:no-underline">
                  {labels.expectedAnswer}
                </AccordionTrigger>
                <AccordionContent>
                  <p className="whitespace-pre-wrap text-muted-foreground pb-2">
                    {expectedAnswer}
                  </p>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        )}

        {/* Supporting Content */}
        {showSupportingContent && question.supporting_content && (
          <div>
            <h4 className="font-semibold text-sm text-muted-foreground mb-2">
              Supporting Content
            </h4>
            <p className="whitespace-pre-wrap text-muted-foreground">
              {question.supporting_content}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
