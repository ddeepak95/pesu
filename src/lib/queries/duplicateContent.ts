import { ContentItem } from "@/types/contentItem";
import { createAssignment, getAssignmentsByIdsForTeacher } from "@/lib/queries/assignments";
import { createLearningContent, getLearningContentsByIds } from "@/lib/queries/learningContent";
import { createQuiz, getQuizzesByIds } from "@/lib/queries/quizzes";
import { createSurvey, getSurveysByIds } from "@/lib/queries/surveys";
import { createContentItem } from "@/lib/queries/contentItems";

export async function duplicateContentItem(params: {
  item: ContentItem;
  destinationClassDbId: string;
  destinationClassGroupId: string;
  userId: string;
}): Promise<void> {
  const { item, destinationClassDbId, destinationClassGroupId, userId } = params;

  // Strip system-generated fields from the content item wrapper so that all
  // user-configured fields (due_at, lock_after_complete, status, …) are
  // forwarded automatically — even ones added in the future.
  const {
    id: _ciId,
    content_item_id: _ciShortId,
    created_by: _ciCreatedBy,
    created_at: _ciCreatedAt,
    updated_at: _ciUpdatedAt,
    class_id: _ciClassId,
    class_group_id: _ciClassGroupId,
    type: _ciType,
    ref_id: _ciRefId,
    position: _ciPosition,
    ...contentItemFields
  } = item;

  if (item.type === "formative_assignment") {
    const [a] = await getAssignmentsByIdsForTeacher([item.ref_id]);
    if (!a) throw new Error("Source assignment not found");

    // Strip system-generated fields; spread everything else so that new
    // assignment options (bot config, display settings, etc.) are copied
    // automatically without needing code changes here.
    const {
      id: _aId,
      assignment_id: _aShortId,
      created_by: _aCreatedBy,
      created_at: _aCreatedAt,
      updated_at: _aUpdatedAt,
      class_id: _aClassId,
      class_group_id: _aClassGroupId,
      status: _aStatus,
      ...assignmentFields
    } = a;

    const next = await createAssignment(
      {
        ...assignmentFields,
        assessment_mode: assignmentFields.assessment_mode ?? "voice",
        class_id: destinationClassDbId,
        class_group_id: destinationClassGroupId,
        status: item.status === "draft" ? "draft" : "active",
      },
      userId
    );

    await createContentItem(
      {
        ...contentItemFields,
        class_id: destinationClassDbId,
        class_group_id: destinationClassGroupId,
        type: "formative_assignment",
        ref_id: next.id,
      },
      userId
    );
    return;
  }

  if (item.type === "learning_content") {
    const [lc] = await getLearningContentsByIds([item.ref_id]);
    if (!lc) throw new Error("Source learning content not found");

    // Strip system-generated & computed fields (content_type is derived
    // from video_url / body by createLearningContent).
    const {
      id: _lcId,
      learning_content_id: _lcShortId,
      created_by: _lcCreatedBy,
      created_at: _lcCreatedAt,
      updated_at: _lcUpdatedAt,
      class_id: _lcClassId,
      class_group_id: _lcClassGroupId,
      status: _lcStatus,
      content_type: _lcContentType,
      ...lcFields
    } = lc;

    const next = await createLearningContent(
      {
        ...lcFields,
        class_id: destinationClassDbId,
        class_group_id: destinationClassGroupId,
        status: item.status === "draft" ? "draft" : "active",
      },
      userId
    );

    await createContentItem(
      {
        ...contentItemFields,
        class_id: destinationClassDbId,
        class_group_id: destinationClassGroupId,
        type: "learning_content",
        ref_id: next.id,
      },
      userId
    );
    return;
  }

  if (item.type === "quiz") {
    const [q] = await getQuizzesByIds([item.ref_id]);
    if (!q) throw new Error("Source quiz not found");

    // Strip system-generated fields. total_points is also excluded because
    // createQuiz recomputes it from the questions array.
    const {
      id: _qId,
      quiz_id: _qShortId,
      created_by: _qCreatedBy,
      created_at: _qCreatedAt,
      updated_at: _qUpdatedAt,
      class_id: _qClassId,
      class_group_id: _qClassGroupId,
      status: _qStatus,
      total_points: _qTotalPoints,
      ...quizFields
    } = q;

    const next = await createQuiz(
      {
        ...quizFields,
        class_id: destinationClassDbId,
        class_group_id: destinationClassGroupId,
        status: item.status === "draft" ? "draft" : "active",
      },
      userId
    );

    await createContentItem(
      {
        ...contentItemFields,
        class_id: destinationClassDbId,
        class_group_id: destinationClassGroupId,
        type: "quiz",
        ref_id: next.id,
      },
      userId
    );
    return;
  }

  if (item.type === "survey") {
    const [s] = await getSurveysByIds([item.ref_id]);
    if (!s) throw new Error("Source survey not found");

    const {
      id: _sId,
      survey_id: _sShortId,
      created_by: _sCreatedBy,
      created_at: _sCreatedAt,
      updated_at: _sUpdatedAt,
      class_id: _sClassId,
      class_group_id: _sClassGroupId,
      status: _sStatus,
      ...surveyFields
    } = s;

    const next = await createSurvey(
      {
        ...surveyFields,
        class_id: destinationClassDbId,
        class_group_id: destinationClassGroupId,
        status: item.status === "draft" ? "draft" : "active",
      },
      userId
    );

    await createContentItem(
      {
        ...contentItemFields,
        class_id: destinationClassDbId,
        class_group_id: destinationClassGroupId,
        type: "survey",
        ref_id: next.id,
      },
      userId
    );
    return;
  }

  throw new Error("Unsupported content type");
}
