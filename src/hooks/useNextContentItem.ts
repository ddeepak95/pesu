"use client";

import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useStudentGroupForClass,
  useContentItemsByGroup,
  useAssignmentsByIds,
  useLearningContentsByIdsForStudent,
  useQuizzesByIdsForStudent,
  useSurveysByIdsForStudent,
} from "@/hooks/swr";
import { Assignment } from "@/types/assignment";
import { LearningContent } from "@/types/learningContent";
import { Quiz } from "@/types/quiz";
import { Survey } from "@/types/survey";

interface UseNextContentItemResult {
  /** Full URL of the next content item, or null if current is last / not found */
  nextUrl: string | null;
  /** True while the underlying SWR hooks are still loading */
  loading: boolean;
}

/**
 * Hook that resolves the next content item's URL in the class content list.
 * Reuses the same SWR hooks as the class page, so data is served from cache.
 *
 * @param classDbId  Class UUID (classes.id) — needed by the SWR hooks
 * @param classId    Class short ID (classes.class_id) — used to build URLs
 * @param currentContentItemId  The current page's content_item UUID
 */
export function useNextContentItem(
  classDbId: string | null,
  classId: string,
  currentContentItemId: string | null
): UseNextContentItemResult {
  const { user } = useAuth();

  // 1. Student group
  const { data: studentGroupId } = useStudentGroupForClass(
    classDbId,
    user?.id ?? null
  );

  // 2. Ordered content items
  const { data: rawItems, isLoading: itemsLoading } = useContentItemsByGroup(
    classDbId,
    studentGroupId ?? null
  );

  const items = useMemo(
    () => (rawItems || []).filter((ci) => ci.status === "active"),
    [rawItems]
  );

  // 3. Derive ref IDs by type
  const assignmentRefIds = useMemo(
    () => items.filter((i) => i.type === "formative_assignment").map((i) => i.ref_id),
    [items]
  );
  const learningContentRefIds = useMemo(
    () => items.filter((i) => i.type === "learning_content").map((i) => i.ref_id),
    [items]
  );
  const quizRefIds = useMemo(
    () => items.filter((i) => i.type === "quiz").map((i) => i.ref_id),
    [items]
  );
  const surveyRefIds = useMemo(
    () => items.filter((i) => i.type === "survey").map((i) => i.ref_id),
    [items]
  );

  // 4. Hydrate entities (served from SWR cache)
  const { data: assignmentsData } = useAssignmentsByIds(assignmentRefIds);
  const { data: learningContentsData } = useLearningContentsByIdsForStudent(learningContentRefIds);
  const { data: quizzesData } = useQuizzesByIdsForStudent(quizRefIds);
  const { data: surveysData } = useSurveysByIdsForStudent(surveyRefIds);

  // 5. Build lookup maps
  const assignmentById = useMemo(() => {
    const map: Record<string, Assignment> = {};
    for (const a of assignmentsData || []) map[a.id] = a;
    return map;
  }, [assignmentsData]);

  const learningContentById = useMemo(() => {
    const map: Record<string, LearningContent> = {};
    for (const lc of learningContentsData || []) map[lc.id] = lc;
    return map;
  }, [learningContentsData]);

  const quizById = useMemo(() => {
    const map: Record<string, Quiz> = {};
    for (const q of quizzesData || []) map[q.id] = q;
    return map;
  }, [quizzesData]);

  const surveyById = useMemo(() => {
    const map: Record<string, Survey> = {};
    for (const s of surveysData || []) map[s.id] = s;
    return map;
  }, [surveysData]);

  // 6. Resolve next item URL
  const nextUrl = useMemo(() => {
    if (!currentContentItemId || items.length === 0) return null;

    const currentIndex = items.findIndex((i) => i.id === currentContentItemId);
    if (currentIndex === -1 || currentIndex >= items.length - 1) return null;

    const nextItem = items[currentIndex + 1];

    if (nextItem.type === "formative_assignment") {
      const a = assignmentById[nextItem.ref_id];
      if (a) return `/student/classes/${classId}/assignments/${a.assignment_id}`;
    } else if (nextItem.type === "learning_content") {
      const lc = learningContentById[nextItem.ref_id];
      if (lc) return `/student/classes/${classId}/learning-content/${lc.learning_content_id}`;
    } else if (nextItem.type === "quiz") {
      const q = quizById[nextItem.ref_id];
      if (q) return `/student/classes/${classId}/quizzes/${q.quiz_id}`;
    } else if (nextItem.type === "survey") {
      const s = surveyById[nextItem.ref_id];
      if (s) return `/student/classes/${classId}/surveys/${s.survey_id}`;
    }

    return null;
  }, [currentContentItemId, items, classId, assignmentById, learningContentById, quizById, surveyById]);

  return {
    nextUrl,
    loading: itemsLoading,
  };
}
