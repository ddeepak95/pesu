import AssignmentForm from "@/components/Teacher/Assignments/AssignmentForm";
import { useAuth } from "@/contexts/AuthContext";
import { createAssignment } from "@/lib/queries/assignments";
import { useRouter, useParams } from "next/navigation";

export default function CreateAssessment() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const classId = params?.classId as string;

  const handleSubmit = async (data: {
    title: string;
    questions: {
      order: number;
      prompt: string;
      total_points: number;
      rubric: { item: string; points: number }[];
      supporting_content: string;
    }[];
    totalPoints: number;
    preferredLanguage: string;
    isPublic: boolean;
    assessmentMode: "voice" | "text_chat" | "static_text";
  }) => {
    if (!user) {
      throw new Error("You must be logged in to create an assignment");
    }

    const assignment = await createAssignment(
      {
        class_id: classId,
        title: data.title,
        questions: data.questions,
        total_points: data.totalPoints,
        preferred_language: data.preferredLanguage,
        is_public: data.isPublic,
        assessment_mode: data.assessmentMode,
      },
      user.id
    );

    router.push(
      `/teacher/classes/${classId}/assignments/${assignment.assignment_id}`
    );
  };

  return (
    <AssignmentForm
      mode="create"
      classId={classId}
      onSubmit={async ({
        title,
        questions,
        totalPoints,
        preferredLanguage,
        isPublic,
        assessmentMode,
      }) =>
        handleSubmit({
          title,
          questions,
          totalPoints,
          preferredLanguage,
          isPublic,
          assessmentMode,
        })
      }
    />
  );
}
