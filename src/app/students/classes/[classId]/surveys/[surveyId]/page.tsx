"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
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
import { getSurveyByShortId } from "@/lib/queries/surveys";
import {
  submitSurveyResponse,
  getStudentResponse,
} from "@/lib/queries/surveyResponses";
import {
  getContentItemByRefId,
  getContentItemsByGroup,
} from "@/lib/queries/contentItems";
import {
  getCompletionsForStudent,
  markContentAsComplete,
} from "@/lib/queries/contentCompletions";
import { getClassByClassId } from "@/lib/queries/classes";
import { getStudentGroupForClass } from "@/lib/queries/groups";
import { getUnlockState } from "@/lib/utils/unlockLogic";
import { Survey, SurveyAnswer, SurveyResponse } from "@/types/survey";
import { ContentItem } from "@/types/contentItem";
import { useAuth } from "@/contexts/AuthContext";
import { useActivityTracking } from "@/hooks/useActivityTracking";
import { ActivityTrackingProvider } from "@/contexts/ActivityTrackingContext";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import LikertInput from "@/components/Student/Surveys/LikertInput";

function SurveyPageContent({
  onClassUuid,
}: {
  onClassUuid?: (id: string) => void;
}) {
  const params = useParams();
  const classId = params.classId as string;
  const surveyId = params.surveyId as string;
  const { user } = useAuth();

  const [survey, setSurvey] = useState<Survey | null>(null);
  const [contentItemId, setContentItemId] = useState<string | null>(null);
  const [contentItem, setContentItem] = useState<ContentItem | null>(null);
  const [existingResponse, setExistingResponse] =
    useState<SurveyResponse | null>(null);
  const [answers, setAnswers] = useState<Map<number, string | number>>(
    new Map()
  );
  const [isContentLocked, setIsContentLocked] = useState<boolean>(false);
  const [lockReason, setLockReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Activity tracking for survey viewing time
  useActivityTracking({
    componentType: "survey",
    componentId: surveyId,
    enabled: !loading && !!survey,
  });

  const fetchSurvey = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSurveyByShortId(surveyId);
      if (!data) {
        setError("Survey not found");
        return;
      }
      setSurvey(data);

      // Check if already responded
      const response = await getStudentResponse(data.id);
      if (response) {
        setExistingResponse(response);
        // Populate answers from existing response
        const answersMap = new Map<number, string | number>();
        response.answers.forEach((a) => {
          answersMap.set(a.question_order, a.value);
        });
        setAnswers(answersMap);
      }

      // Fetch content item for completion tracking and unlock checking
      const fetchedContentItem = await getContentItemByRefId(data.id, "survey");
      if (fetchedContentItem) {
        setContentItemId(fetchedContentItem.id);
        setContentItem(fetchedContentItem);

        // Check unlock status if user is authenticated
        if (user) {
          try {
            const classData = await getClassByClassId(classId);
            if (classData?.id) {
              onClassUuid?.(classData.id);
            }
            if (classData?.enable_progressive_unlock) {
              const groupId = await getStudentGroupForClass(
                classData.id,
                user.id
              );

              if (!groupId) {
                return;
              }

              const allContentItems = await getContentItemsByGroup({
                classDbId: classData.id,
                classGroupId: groupId,
              });

              const contentItemIds = allContentItems.map((item) => item.id);
              const completedIds = await getCompletionsForStudent(
                contentItemIds
              );

              const unlockState = getUnlockState(
                fetchedContentItem.id,
                allContentItems,
                completedIds,
                true
              );

              if (unlockState && unlockState.isLocked) {
                setIsContentLocked(true);
                setLockReason(unlockState.lockReason);
              }
            }
          } catch (unlockErr) {
            console.error("Error checking unlock status:", unlockErr);
          }
        }
      }
    } catch (err) {
      console.error("Error fetching survey:", err);
      setError("Failed to load survey");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (surveyId) fetchSurvey();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId]);

  const setAnswer = (questionOrder: number, value: string | number) => {
    setAnswers((prev) => {
      const next = new Map(prev);
      next.set(questionOrder, value);
      return next;
    });
  };

  const validate = (): string | null => {
    if (!survey) return "Survey not loaded";

    for (const q of survey.questions) {
      if (q.required) {
        const answer = answers.get(q.order);
        if (answer === undefined || answer === null || answer === "") {
          return `Question ${q.order + 1} is required`;
        }
      }
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
    if (!survey || !contentItemId) return;

    setSubmitting(true);
    try {
      // Build answers array
      const answersArray: SurveyAnswer[] = [];
      survey.questions.forEach((q) => {
        const value = answers.get(q.order);
        if (value !== undefined && value !== null && value !== "") {
          answersArray.push({
            question_order: q.order,
            value,
          });
        }
      });

      // Submit response
      await submitSurveyResponse(survey.id, answersArray);

      // Mark content as complete
      await markContentAsComplete(contentItemId);

      setIsDialogOpen(false);
      showSuccessToast("Survey submitted successfully!");

      // Reload to show submitted state
      await fetchSurvey();
    } catch (err) {
      console.error("Error submitting survey:", err);
      showErrorToast("Failed to submit survey. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-muted-foreground">Loading survey...</p>
        </div>
      </PageLayout>
    );
  }

  if (error || !survey) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-destructive">{error || "Survey not found"}</p>
        </div>
      </PageLayout>
    );
  }

  if (isContentLocked) {
    return (
      <PageLayout>
        <div>
          <div className="mb-4">
            <BackButton href={`/students/classes/${classId}`} />
          </div>
          <div className="text-center py-12">
            <div className="inline-block p-4 rounded-full bg-muted mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-12 w-12 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2">Content Locked</h2>
            <p className="text-muted-foreground mb-4">{lockReason}</p>
            <BackButton href={`/students/classes/${classId}`} />
          </div>
        </div>
      </PageLayout>
    );
  }

  const isSubmitted = !!existingResponse;

  return (
    <PageLayout>
      <div>
        <div>
          <div className="mb-4">
            <BackButton href={`/students/classes/${classId}`} />
          </div>
          <div className="mb-6">
            <h1 className="text-3xl font-bold">{survey.title}</h1>
            {survey.description && (
              <p className="mt-2 text-muted-foreground">{survey.description}</p>
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
            {survey.questions
              .sort((a, b) => a.order - b.order)
              .map((q, idx) => (
                <Card key={idx}>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      Question {idx + 1}
                      {q.required && (
                        <span className="text-xs text-red-500">*Required</span>
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
                  </CardContent>
                </Card>
              ))}

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

export default function StudentSurveyPage() {
  const params = useParams();
  const classId = params.classId as string;
  const { user } = useAuth();
  const [classUuid, setClassUuid] = useState<string | null>(null);

  return (
    <ActivityTrackingProvider userId={user?.id} classId={classUuid ?? classId}>
      <SurveyPageContent onClassUuid={setClassUuid} />
    </ActivityTrackingProvider>
  );
}
