import { ContentItem } from "@/types/contentItem";
import { createAssignment, getAssignmentsByIdsForTeacher } from "@/lib/queries/assignments";
import { createLearningContent, getLearningContentsByIds } from "@/lib/queries/learningContent";
import { createQuiz, getQuizzesByIds } from "@/lib/queries/quizzes";
import { createContentItem } from "@/lib/queries/contentItems";

export async function duplicateContentItem(params: {
  item: ContentItem;
  destinationClassDbId: string;
  destinationClassGroupId: string;
  userId: string;
}): Promise<void> {
  const { item, destinationClassDbId, destinationClassGroupId, userId } = params;

  if (item.type === "formative_assignment") {
    const [a] = await getAssignmentsByIdsForTeacher([item.ref_id]);
    if (!a) throw new Error("Source assignment not found");

    const next = await createAssignment(
      {
        class_id: destinationClassDbId,
        class_group_id: destinationClassGroupId,
        title: a.title,
        questions: a.questions,
        total_points: a.total_points,
        preferred_language: a.preferred_language,
        is_public: a.is_public,
        assessment_mode: a.assessment_mode ?? "voice",
        status: item.status === "draft" ? "draft" : "active",
      },
      userId
    );

    await createContentItem(
      {
        class_id: destinationClassDbId,
        class_group_id: destinationClassGroupId,
        type: "formative_assignment",
        ref_id: next.id,
        status: item.status,
      },
      userId
    );
    return;
  }

  if (item.type === "learning_content") {
    const [lc] = await getLearningContentsByIds([item.ref_id]);
    if (!lc) throw new Error("Source learning content not found");

    const next = await createLearningContent(
      {
        class_id: destinationClassDbId,
        class_group_id: destinationClassGroupId,
        title: lc.title,
        video_url: lc.video_url ?? null,
        body: lc.body ?? null,
        status: item.status === "draft" ? "draft" : "active",
      },
      userId
    );

    await createContentItem(
      {
        class_id: destinationClassDbId,
        class_group_id: destinationClassGroupId,
        type: "learning_content",
        ref_id: next.id,
        status: item.status,
      },
      userId
    );
    return;
  }

  if (item.type === "quiz") {
    const [q] = await getQuizzesByIds([item.ref_id]);
    if (!q) throw new Error("Source quiz not found");

    const next = await createQuiz(
      {
        class_id: destinationClassDbId,
        class_group_id: destinationClassGroupId,
        title: q.title,
        questions: q.questions,
        status: item.status === "draft" ? "draft" : "active",
      },
      userId
    );

    await createContentItem(
      {
        class_id: destinationClassDbId,
        class_group_id: destinationClassGroupId,
        type: "quiz",
        ref_id: next.id,
        status: item.status,
      },
      userId
    );
    return;
  }

  throw new Error("Unsupported content type");
}

