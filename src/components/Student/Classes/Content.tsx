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
import { getTeacherUnlocksForStudent } from "@/lib/queries/teacherUnlocks";

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
  const { data: completedContentIds = new Set<string>(), mutate: mutateCompletions } =
    useCompletionsForStudent(contentItemIds);

  // Revalidate completions when page becomes visible or when shown after navigation (e.g. browser back from quiz/survey)
  useEffect(() => {
    const onVisible = () => mutateCompletions();
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) mutateCompletions(); // bfcache restore
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [mutateCompletions]);

  // Fetch teacher unlock IDs for items that require teacher unlock
  const [teacherUnlockedIds, setTeacherUnlockedIds] = useState<Set<string>>(new Set());
  const itemsRequiringTeacherUnlock = useMemo(
    () => items.filter((i) => i.require_teacher_unlock).map((i) => i.id),
    [items]
  );

  useEffect(() => {
    if (itemsRequiringTeacherUnlock.length === 0) {
      setTeacherUnlockedIds(new Set());
      return;
    }
    getTeacherUnlocksForStudent(itemsRequiringTeacherUnlock).then(
      (unlocked) => setTeacherUnlockedIds(unlocked)
    );
  }, [itemsRequiringTeacherUnlock]);

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
    return calculateUnlockStates(items, completedContentIds, progressiveUnlockEnabled, teacherUnlockedIds);
  }, [items, completedContentIds, classData.enable_progressive_unlock, teacherUnlockedIds]);

  // Partition items into "To Complete" and "Completed"
  const { toCompleteItems, completedItems } = useMemo(() => {
    const toDo: ContentItem[] = [];
    const done: ContentItem[] = [];
    for (const item of items) {
      if (completedContentIds.has(item.id)) {
        done.push(item);
      } else {
        toDo.push(item);
      }
    }
    return { toCompleteItems: toDo, completedItems: done.reverse() };
  }, [items, completedContentIds]);

  const loading = itemsLoading;
  const error =
    groupError?.message || itemsError?.message || null;

  const handleOpen = (item: ContentItem) => {
    // Save scroll position so CloseButton can restore it
    try {
      sessionStorage.setItem(
        `scroll_${classData.class_id}`,
        String(window.scrollY)
      );
    } catch {}

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

  const renderContentCard = (item: ContentItem) => {
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
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            No content available for your group yet.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {toCompleteItems.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-muted-foreground mb-4">
                To Complete ({toCompleteItems.length})
              </h2>
              <List
                items={toCompleteItems}
                keyExtractor={(item) => item.id}
                renderItem={renderContentCard}
              />
            </section>
          )}

          {completedItems.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-muted-foreground mb-4">
                Completed ({completedItems.length})
              </h2>
              <List
                items={completedItems}
                keyExtractor={(item) => item.id}
                renderItem={renderContentCard}
              />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
