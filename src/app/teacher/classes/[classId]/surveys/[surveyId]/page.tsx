"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import PageTitle from "@/components/Shared/PageTitle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import {
  getSurveyByShortIdForTeacher,
  deleteSurvey,
} from "@/lib/queries/surveys";
import { getSurveyResponseCount } from "@/lib/queries/surveyResponses";
import { softDeleteContentItemByRef } from "@/lib/queries/contentItems";
import { Survey } from "@/types/survey";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SurveyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const classId = params.classId as string;
  const surveyId = params.surveyId as string;

  const [survey, setSurvey] = useState<Survey | null>(null);
  const [responseCount, setResponseCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSurvey = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSurveyByShortIdForTeacher(surveyId);
      if (!data) {
        setError("Survey not found");
      } else {
        setSurvey(data);
        // Fetch response count
        const count = await getSurveyResponseCount(data.id);
        setResponseCount(count);
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

  const handleEdit = () => {
    const qs = searchParams.toString();
    router.push(
      `/teacher/classes/${classId}/surveys/${surveyId}/edit${
        qs ? `?${qs}` : ""
      }`
    );
  };

  const handleDelete = async () => {
    if (!user || !survey) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this survey? This action cannot be undone."
    );
    if (!confirmed) return;

    try {
      await deleteSurvey(survey.id);
      await softDeleteContentItemByRef({
        class_id: survey.class_id,
        type: "survey",
        ref_id: survey.id,
      });
      router.push(`/teacher/classes/${classId}`);
    } catch (err) {
      console.error("Error deleting survey:", err);
      alert("Failed to delete survey. Please try again.");
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

  return (
    <PageLayout>
      <div>
        <div>
          <div className="mb-4">
            <BackButton />
          </div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <PageTitle title={survey.title} />
              <div className="flex items-center gap-4 mt-1 text-muted-foreground">
                <p>
                  {survey.questions.length} question
                  {survey.questions.length === 1 ? "" : "s"}
                </p>
                <span>•</span>
                <p>
                  {responseCount} response{responseCount === 1 ? "" : "s"}
                </p>
                <span>•</span>
                <p className="capitalize">Status: {survey.status}</p>
              </div>
              {survey.description && (
                <p className="mt-2 text-muted-foreground">
                  {survey.description}
                </p>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Options</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleEdit}>Edit</DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive"
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Tabs defaultValue="questions" className="w-full">
            <TabsList>
              <TabsTrigger value="questions">Questions</TabsTrigger>
              <TabsTrigger value="responses">Responses</TabsTrigger>
            </TabsList>

            <TabsContent value="questions" className="space-y-4 py-6">
              {survey.questions
                .sort((a, b) => a.order - b.order)
                .map((q, idx) => (
                  <Card key={idx}>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        Question {idx + 1}
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            q.type === "likert"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {q.type === "likert" ? "Likert Scale" : "Open-Ended"}
                        </span>
                        {q.required && (
                          <span className="text-xs text-red-500">Required</span>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="whitespace-pre-wrap">{q.prompt}</p>
                      {q.type === "likert" && (
                        <div className="flex flex-wrap gap-2">
                          {q.options
                            .sort((a, b) => a.value - b.value)
                            .map((o) => (
                              <div
                                key={o.id}
                                className="flex items-center gap-1 rounded-md border px-3 py-2 text-sm"
                              >
                                <span className="font-medium">{o.value}.</span>
                                <span>{o.text}</span>
                              </div>
                            ))}
                        </div>
                      )}
                      {q.type === "open_ended" && q.placeholder && (
                        <p className="text-sm text-muted-foreground">
                          Placeholder: &quot;{q.placeholder}&quot;
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
            </TabsContent>

            <TabsContent value="responses" className="py-6">
              <div className="text-center p-12">
                <p className="text-muted-foreground text-lg">
                  {responseCount > 0
                    ? `${responseCount} response${
                        responseCount === 1 ? "" : "s"
                      } collected. Detailed analytics coming soon.`
                    : "No responses yet."}
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PageLayout>
  );
}
