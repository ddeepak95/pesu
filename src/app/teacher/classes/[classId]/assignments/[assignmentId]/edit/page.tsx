"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import AssignmentForm from "@/components/Teacher/Assignments/AssignmentForm";
import { useAuth } from "@/contexts/AuthContext";
import {
  getAssignmentByIdForTeacher,
  updateAssignment,
} from "@/lib/queries/assignments";
import {
  Question,
  ResponderFieldConfig,
  BotPromptConfig,
} from "@/types/assignment";

export default function EditAssignmentPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const classId = params.classId as string;
  const assignmentId = params.assignmentId as string;

  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [preferredLanguage, setPreferredLanguage] = useState("en");
  const [lockLanguage, setLockLanguage] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [assessmentMode, setAssessmentMode] = useState<
    "voice" | "text_chat" | "static_text"
  >("voice");
  const [responderFieldsConfig, setResponderFieldsConfig] = useState<
    ResponderFieldConfig[] | undefined
  >(undefined);
  const [maxAttempts, setMaxAttempts] = useState<number>(1);
  const [botPromptConfig, setBotPromptConfig] = useState<
    BotPromptConfig | undefined
  >(undefined);
  const [studentInstructions, setStudentInstructions] = useState<string>("");
  const [showRubric, setShowRubric] = useState<boolean>(true);
  const [showRubricPoints, setShowRubricPoints] = useState<boolean>(true);
  const [useStarDisplay, setUseStarDisplay] = useState<boolean>(false);
  const [starScale, setStarScale] = useState<number>(5);
  const [error, setError] = useState<string | null>(null);
  const [assignmentDbId, setAssignmentDbId] = useState<string | null>(null);
  const [loadingAssignment, setLoadingAssignment] = useState(true);

  // Fetch assignment data
  useEffect(() => {
    const fetchAssignment = async () => {
      setLoadingAssignment(true);
      try {
        const assignmentData = await getAssignmentByIdForTeacher(assignmentId);
        if (assignmentData) {
          setTitle(assignmentData.title);
          setQuestions(assignmentData.questions);
          setPreferredLanguage(assignmentData.preferred_language);
          setLockLanguage(assignmentData.lock_language ?? false);
          setIsPublic(assignmentData.is_public);
          setAssessmentMode(assignmentData.assessment_mode ?? "voice");
          setResponderFieldsConfig(assignmentData.responder_fields_config);
          setMaxAttempts(assignmentData.max_attempts ?? 1);
          setBotPromptConfig(assignmentData.bot_prompt_config);
          setStudentInstructions(assignmentData.student_instructions ?? "");
          setShowRubric(assignmentData.show_rubric ?? true);
          setShowRubricPoints(assignmentData.show_rubric_points ?? true);
          setUseStarDisplay(assignmentData.use_star_display ?? false);
          setStarScale(assignmentData.star_scale ?? 5);
          setAssignmentDbId(assignmentData.id);
        } else {
          setError("Assignment not found");
        }
      } catch (err) {
        console.error("Error fetching assignment:", err);
        setError("Failed to load assignment");
      } finally {
        setLoadingAssignment(false);
      }
    };

    if (assignmentId) {
      fetchAssignment();
    }
  }, [assignmentId]);

  const handleSubmit = async (data: {
    title: string;
    questions: {
      order: number;
      prompt: string;
      total_points: number;
      rubric: { item: string; points: number }[];
      supporting_content: string;
      expected_answer?: string;
    }[];
    totalPoints: number;
    preferredLanguage: string;
    lockLanguage: boolean;
    isPublic: boolean;
    assessmentMode: "voice" | "text_chat" | "static_text";
    isDraft: boolean;
    responderFieldsConfig?: ResponderFieldConfig[];
    maxAttempts?: number;
    botPromptConfig?: BotPromptConfig;
    studentInstructions?: string;
    showRubric?: boolean;
    showRubricPoints?: boolean;
    useStarDisplay?: boolean;
    starScale?: number;
  }) => {
    if (!user) {
      throw new Error("You must be logged in to update an assignment");
    }

    if (!assignmentDbId) {
      throw new Error("Assignment not found");
    }

    await updateAssignment(assignmentDbId, {
      title: data.title,
      questions: data.questions,
      total_points: data.totalPoints,
      preferred_language: data.preferredLanguage,
      lock_language: data.lockLanguage,
      is_public: data.isPublic,
      assessment_mode: data.assessmentMode,
      responder_fields_config: data.responderFieldsConfig,
      max_attempts: data.maxAttempts ?? 1,
      bot_prompt_config: data.botPromptConfig,
      student_instructions: data.studentInstructions,
      show_rubric: data.showRubric ?? true,
      show_rubric_points: data.showRubricPoints ?? true,
      use_star_display: data.useStarDisplay ?? false,
      star_scale: data.starScale ?? 5,
    });
  };

  if (loadingAssignment) {
    return (
      <PageLayout>
        <div className="p-8 text-center">
          <p className="text-muted-foreground">Loading assignment...</p>
        </div>
      </PageLayout>
    );
  }

  if (error && !assignmentDbId) {
    return (
      <PageLayout>
        <div className="p-8 text-center">
          <p className="text-destructive">{error}</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="max-w-4xl mx-auto p-8">
        <div className="mb-4">
          <BackButton />
        </div>
        <h1 className="text-3xl font-bold mb-8">Edit Assignment</h1>
        <AssignmentForm
          mode="edit"
          classId={classId}
          assignmentId={assignmentId}
          initialTitle={title}
          initialQuestions={questions}
          initialLanguage={preferredLanguage}
          initialLockLanguage={lockLanguage}
          initialIsPublic={isPublic}
          initialAssessmentMode={assessmentMode}
          initialResponderFieldsConfig={responderFieldsConfig}
          initialMaxAttempts={maxAttempts}
          initialBotPromptConfig={botPromptConfig}
          initialStudentInstructions={studentInstructions}
          initialShowRubric={showRubric}
          initialShowRubricPoints={showRubricPoints}
          initialUseStarDisplay={useStarDisplay}
          initialStarScale={starScale}
          onSubmit={handleSubmit}
        />

        <div className="mt-6 flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const qs = searchParams.toString();
              router.push(
                `/teacher/classes/${classId}/assignments/${assignmentId}${
                  qs ? `?${qs}` : ""
                }`
              );
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    </PageLayout>
  );
}
