"use client";

import { Question } from "@/types/assignment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface QuestionViewProps {
  question: Question;
  index: number;
  showRubric?: boolean;
  showSupportingContent?: boolean;
}

/**
 * Shared component for displaying assignment questions
 * Can be used by both teachers and students
 */
export default function QuestionView({
  question,
  index,
  showRubric = true,
  showSupportingContent = true,
}: QuestionViewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          Question {index + 1} ({question.total_points} points)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Prompt */}
        <div>
          <h4 className="font-semibold text-sm text-muted-foreground mb-2">
            Prompt
          </h4>
          <p className="whitespace-pre-wrap">{question.prompt}</p>
        </div>

        {/* Rubric */}
        {showRubric && question.rubric && question.rubric.length > 0 && (
          <div>
            <h4 className="font-semibold text-sm text-muted-foreground mb-2">
              Rubric
            </h4>
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
          </div>
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




