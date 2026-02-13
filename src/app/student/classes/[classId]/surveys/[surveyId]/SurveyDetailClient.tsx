"use client";

import { useState } from "react";
import PageLayout from "@/components/PageLayout";
import CloseButton from "@/components/ui/close-button";
import GoToClassButton from "@/components/ui/go-to-class-button";
import NextItemButton from "@/components/ui/next-item-button";
import PageTitle from "@/components/Shared/PageTitle";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { submitSurveyResponse } from "@/lib/queries/surveyResponses";
import { markContentAsComplete } from "@/lib/queries/contentCompletions";
import { invalidateCompletionsCache } from "@/hooks/swr";
import {
  Survey,
  SurveyAnswer,
  SurveyResponse,
  DropdownQuestion,
} from "@/types/survey";
import { useAuth } from "@/contexts/AuthContext";
import { useActivityTracking } from "@/hooks/useActivityTracking";
import { ActivityTrackingProvider } from "@/contexts/ActivityTrackingContext";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import MarkdownContent from "@/components/Shared/MarkdownContent";
import LikertInput from "@/components/Student/Surveys/LikertInput";
import DropdownInput from "@/components/Student/Surveys/DropdownInput";

interface SurveyInnerProps {
  survey: Survey;
  contentItemId: string | null;
  initialExistingResponse: SurveyResponse | null;
  classId: string;
  classUuid: string | null;
}

function SurveyInner({
  survey,
  contentItemId,
  initialExistingResponse,
  classId,
  classUuid,
}: SurveyInnerProps) {
  const [existingResponse, setExistingResponse] =
    useState<SurveyResponse | null>(initialExistingResponse);

  // Populate answers from existing response
  const initialAnswers = new Map<number, string | number>();
  if (initialExistingResponse) {
    initialExistingResponse.answers.forEach((a) => {
      initialAnswers.set(a.question_order, a.value);
    });
  }
  const [answers, setAnswers] =
    useState<Map<number, string | number>>(initialAnswers);

  const [submitting, setSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Activity tracking for survey viewing time
  useActivityTracking({
    componentType: "survey",
    componentId: survey.survey_id,
    enabled: true,
  });

  const setAnswer = (questionOrder: number, value: string | number) => {
    setAnswers((prev) => {
      const next = new Map(prev);
      next.set(questionOrder, value);
      return next;
    });
  };

  const validate = (): string | null => {
    const unansweredNumbers: number[] = [];
    let questionNumber = 0;

    const sorted = [...survey.questions].sort((a, b) => a.order - b.order);
    for (const q of sorted) {
      if (q.type === "section_title") continue;
      questionNumber++;

      if (q.required) {
        const answer = answers.get(q.order);
        if (answer === undefined || answer === null || answer === "") {
          unansweredNumbers.push(questionNumber);
        }
      }
    }

    if (unansweredNumbers.length > 0) {
      return `Please answer required question${unansweredNumbers.length > 1 ? "s" : ""}: ${unansweredNumbers.join(", ")}`;
    }
    return null;
  };

  const handleSubmitClick = () => {
    const validationError = validate();
    if (validationError) {
      showErrorToast(validationError);
      return;
    }
    setIsDialogOpen(true);
  };

  const handleConfirmSubmit = async () => {
    if (!contentItemId) return;

    setSubmitting(true);
    try {
      // Build answers array (skip section titles)
      const answersArray: SurveyAnswer[] = [];
      survey.questions.forEach((q) => {
        if (q.type === "section_title") return;
        const value = answers.get(q.order);
        if (value !== undefined && value !== null && value !== "") {
          answersArray.push({
            question_order: q.order,
            value,
          });
        }
      });

      // Submit response
      const response = await submitSurveyResponse(survey.id, answersArray);

      // Mark content as complete
      await markContentAsComplete(contentItemId);
      await invalidateCompletionsCache();

      setIsDialogOpen(false);
      setExistingResponse(response);
      showSuccessToast("Survey submitted successfully!");
    } catch (err) {
      console.error("Error submitting survey:", err);
      showErrorToast("Failed to submit survey. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const isSubmitted = !!existingResponse;

  return (
    <PageLayout>
      <div>
        <div>
          <div className="mb-4">
            <GoToClassButton classId={classId} />
          </div>
          <div className="mb-6">
            <PageTitle
              title={survey.title}
              badge={
                isSubmitted ? (
                  <span className="text-xs rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-green-600 dark:text-green-400 w-fit">
                    Completed
                  </span>
                ) : null
              }
            />
            {survey.description && (
              <div className="mt-3">
                <MarkdownContent content={survey.description} />
              </div>
            )}
            {isSubmitted && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-green-700 font-medium">
                  You have already submitted this survey. Your responses are
                  shown below.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-4 pb-8">
            {(() => {
              let questionNumber = 0;
              return survey.questions
                .sort((a, b) => a.order - b.order)
                .map((q, idx) => {
                  // Section title
                  if (q.type === "section_title") {
                    return (
                      <div key={idx} className="pt-4 pb-2">
                        <h3 className="text-xl font-semibold">{q.prompt}</h3>
                        {q.description && (
                          <p className="text-muted-foreground mt-1">
                            {q.description}
                          </p>
                        )}
                      </div>
                    );
                  }

                  questionNumber++;
                  return (
                    <Card key={idx}>
                      <CardHeader>
                        <CardTitle className="text-sm flex items-center gap-2">
                          Question {questionNumber}
                          {q.required && (
                            <span className="text-xs text-red-500">
                              *Required
                            </span>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="whitespace-pre-wrap">{q.prompt}</p>

                        {q.type === "likert" && (
                          <LikertInput
                            options={q.options}
                            value={answers.get(q.order) as number | null}
                            onChange={(value) => setAnswer(q.order, value)}
                            disabled={isSubmitted}
                            required={q.required}
                          />
                        )}

                        {q.type === "open_ended" && (
                          <Textarea
                            value={(answers.get(q.order) as string) || ""}
                            onChange={(e) => setAnswer(q.order, e.target.value)}
                            placeholder={
                              q.placeholder || "Type your response here..."
                            }
                            disabled={isSubmitted}
                            rows={4}
                            className="resize-none"
                          />
                        )}

                        {q.type === "dropdown" && (
                          <DropdownInput
                            options={(q as DropdownQuestion).options}
                            value={(answers.get(q.order) as string) || null}
                            onChange={(value) => setAnswer(q.order, value)}
                            disabled={isSubmitted}
                            required={q.required}
                          />
                        )}
                      </CardContent>
                    </Card>
                  );
                });
            })()}

            {/* Submit Button */}
            {!isSubmitted && (
              <div className="flex justify-center pt-4">
                <Button
                  size="lg"
                  onClick={handleSubmitClick}
                  disabled={submitting}
                >
                  {submitting ? "Submitting..." : "Submit Survey"}
                </Button>
              </div>
            )}

            {contentItemId && (
              <NextItemButton
                classDbId={classUuid}
                classId={classId}
                contentItemId={contentItemId}
              />
            )}
            <CloseButton
              href={`/student/classes/${classId}`}
            />
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Survey</DialogTitle>
            <DialogDescription>
              Are you sure you want to submit this survey? You cannot change
              your responses after submission.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmSubmit} disabled={submitting}>
              {submitting ? "Submitting..." : "Yes, Submit Survey"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}

interface SurveyDetailClientProps {
  survey: Survey;
  contentItemId: string | null;
  existingResponse: SurveyResponse | null;
  classUuid: string | null;
  classId: string;
}

export default function SurveyDetailClient({
  survey,
  contentItemId,
  existingResponse,
  classUuid,
  classId,
}: SurveyDetailClientProps) {
  const { user } = useAuth();

  return (
    <ActivityTrackingProvider userId={user?.id} classId={classUuid ?? classId}>
      <SurveyInner
        survey={survey}
        contentItemId={contentItemId}
        initialExistingResponse={existingResponse}
        classId={classId}
        classUuid={classUuid}
      />
    </ActivityTrackingProvider>
  );
}
