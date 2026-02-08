"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Class } from "@/types/class";
import { ContentItem } from "@/types/contentItem";
import { Assignment } from "@/types/assignment";
import { LearningContent } from "@/types/learningContent";
import { Quiz } from "@/types/quiz";
import { Survey } from "@/types/survey";
import List from "@/components/ui/List";
import { useAuth } from "@/contexts/AuthContext";
import ContentCard from "@/components/Student/Classes/ContentParts/ContentCard";
import { calculateUnlockStates, UnlockState } from "@/lib/utils/unlockLogic";
import {
  useStudentGroupForClass,
  useContentItemsByGroup,
  useAssignmentsByIds,
  useLearningContentsByIdsForStudent,
  useQuizzesByIdsForStudent,
  useSurveysByIdsForStudent,
  useCompletionsForStudent,
} from "@/hooks/swr";

interface ContentProps {
  classData: Class;
}

export default function Content({ classData }: ContentProps) {
  const router = useRouter();
  const { user } = useAuth();

  // --- SWR hooks ---
  const { data: studentGroupId, error: groupError } = useStudentGroupForClass(
    classData.id,
    user?.id ?? null
  );

  const {
    data: rawItems,
    error: itemsError,
    isLoading: itemsLoading,
  } = useContentItemsByGroup(classData.id, studentGroupId ?? null);

  // Only show active items to students
  const items = useMemo(
    () => (rawItems || []).filter((ci) => ci.status === "active"),
    [rawItems]
  );

  // Derive IDs for hydration queries
  const formativeAssignmentIds = useMemo(
    () => items.filter((i) => i.type === "formative_assignment").map((i) => i.ref_id),
    [items]
  );
  const learningContentIds = useMemo(
    () => items.filter((i) => i.type === "learning_content").map((i) => i.ref_id),
    [items]
  );
  const quizIds = useMemo(
    () => items.filter((i) => i.type === "quiz").map((i) => i.ref_id),
    [items]
  );
  const surveyIds = useMemo(
    () => items.filter((i) => i.type === "survey").map((i) => i.ref_id),
    [items]
  );

  // Hydrate related entities via SWR
  const { data: assignmentsData } = useAssignmentsByIds(formativeAssignmentIds);
  const { data: learningContentsData } = useLearningContentsByIdsForStudent(learningContentIds);
  const { data: quizzesData } = useQuizzesByIdsForStudent(quizIds);
  const { data: surveysData } = useSurveysByIdsForStudent(surveyIds);

  // Fetch completions
  const contentItemIds = useMemo(() => items.map((item) => item.id), [items]);
  const { data: completedContentIds = new Set<string>() } = useCompletionsForStudent(contentItemIds);

  // Build lookup maps
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

  // Calculate unlock states
  const unlockStates = useMemo(() => {
    if (items.length === 0) return new Map<string, UnlockState>();
    const progressiveUnlockEnabled = classData.enable_progressive_unlock ?? false;
    return calculateUnlockStates(items, completedContentIds, progressiveUnlockEnabled);
  }, [items, completedContentIds, classData.enable_progressive_unlock]);

  const loading = itemsLoading;
  const error =
    groupError?.message || itemsError?.message || null;

  const handleOpen = (item: ContentItem) => {
    if (item.type === "formative_assignment") {
      const a = assignmentById[item.ref_id];
      if (a) {
        router.push(
          `/student/classes/${classData.class_id}/assignments/${a.assignment_id}`
        );
        return;
      }
    }

    if (item.type === "learning_content") {
      const lc = learningContentById[item.ref_id];
      if (lc) {
        router.push(
          `/student/classes/${classData.class_id}/learning-content/${lc.learning_content_id}`
        );
      }
    }

    if (item.type === "quiz") {
      const q = quizById[item.ref_id];
      if (q) {
        router.push(
          `/student/classes/${classData.class_id}/quizzes/${q.quiz_id}`
        );
      }
    }

    if (item.type === "survey") {
      const s = surveyById[item.ref_id];
      if (s) {
        router.push(
          `/student/classes/${classData.class_id}/surveys/${s.survey_id}`
        );
      }
    }
  };

  return (
    <div className="py-6">
      {loading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading content…</p>
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-destructive">{error}</p>
        </div>
      ) : !studentGroupId ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            You haven&apos;t been assigned to a group yet.
          </p>
        </div>
      ) : (
        <List
          items={items}
          keyExtractor={(item) => item.id}
          emptyMessage="No content available for your group yet."
          renderItem={(item) => {
            const resolvedTitle =
              item.type === "formative_assignment"
                ? assignmentById[item.ref_id]?.title
                : item.type === "quiz"
                ? quizById[item.ref_id]?.title
                : item.type === "survey"
                ? surveyById[item.ref_id]?.title
                : learningContentById[item.ref_id]?.title;

            const titleLoading = !resolvedTitle;

            const assessmentMode =
              item.type === "formative_assignment"
                ? assignmentById[item.ref_id]?.assessment_mode
                : undefined;

            return (
              <ContentCard
                item={item}
                title={resolvedTitle}
                titleLoading={titleLoading}
                assessmentMode={assessmentMode}
                isComplete={completedContentIds.has(item.id)}
                unlockState={unlockStates.get(item.id)}
                onOpen={() => handleOpen(item)}
              />
            );
          }}
        />
      )}
    </div>
  );
}
