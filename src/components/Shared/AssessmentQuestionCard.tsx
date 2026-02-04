"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Question } from "@/types/assignment";

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
  className,
}: AssessmentQuestionCardProps) {
  const shouldShowRubric =
    showRubric && question.rubric && question.rubric.length > 0;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">Prompt</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="whitespace-pre-wrap">{question.prompt}</p>

        {/* Student Instructions */}
        {studentInstructions && (
          <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
              Instructions
            </p>
            <p className="text-sm text-blue-700 dark:text-blue-300 whitespace-pre-wrap">
              {studentInstructions}
            </p>
          </div>
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
