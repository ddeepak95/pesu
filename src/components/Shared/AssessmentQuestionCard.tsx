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
}

export function AssessmentQuestionCard({
  question,
  children,
}: AssessmentQuestionCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Prompt</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="whitespace-pre-wrap">{question.prompt}</p>

        {/* View Rubric Accordion */}
        {question.rubric && question.rubric.length > 0 && (
          <Accordion type="single" collapsible>
            <AccordionItem value="rubric">
              <AccordionTrigger>View Rubric</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {question.rubric.map((item, idx) => (
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
          </Accordion>
        )}

        {/* Assessment-specific content (voice controls, chat area, etc.) */}
        {children}
      </CardContent>
    </Card>
  );
}


