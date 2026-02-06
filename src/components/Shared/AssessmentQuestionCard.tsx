"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Question } from "@/types/assignment";
import MarkdownContent from "@/components/Shared/MarkdownContent";
import InfoCallout from "@/components/Shared/InfoCallout";

interface AssessmentQuestionCardProps {
  question: Question;
  children?: React.ReactNode; // For assessment-specific content (voice controls, chat area, etc.)
  studentInstructions?: string; // Display-only instructions for students
  showRubric?: boolean; // Whether to show the rubric (default: true)
  showRubricPoints?: boolean; // Whether to show points in rubric (default: true)
  className?: string;
}

export function AssessmentQuestionCard({
  question,
  children,
  studentInstructions,
  showRubric = true,
  showRubricPoints = true,
}: AssessmentQuestionCardProps) {
  const shouldShowRubric =
    showRubric && question.rubric && question.rubric.length > 0;

  return (
    <Card className="w-full bg-gray-300/5">
      <CardHeader>
        <CardTitle className="text-lg">{question.prompt}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Student Instructions */}
        {studentInstructions && (
          <InfoCallout title="Instructions">
            <MarkdownContent content={studentInstructions} />
          </InfoCallout>
        )}

        {/* View Rubric Accordion */}
        {shouldShowRubric && (
          <Accordion type="single" collapsible>
            <AccordionItem value="rubric">
              <AccordionTrigger>View Rubric</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {question.rubric.map((item, idx) => (
                    <div
                      key={idx}
                      className={`flex ${
                        showRubricPoints ? "justify-between" : "justify-start"
                      } items-start gap-4 p-3 bg-muted/50 rounded-md`}
                    >
                      <span className="flex-1">{item.item}</span>
                      {showRubricPoints && (
                        <span className="font-semibold text-sm whitespace-nowrap">
                          {item.points} pts
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {/* Assessment-specific content (voice controls, chat area, etc.) */}
        {children}
      </CardContent>
    </Card>
  );
}
