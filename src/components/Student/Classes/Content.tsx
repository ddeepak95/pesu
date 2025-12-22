"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Class } from "@/types/class";
import { ContentItem } from "@/types/contentItem";
import {
  getContentItemsByGroup,
} from "@/lib/queries/contentItems";
import { getAssignmentsByIdsForTeacher } from "@/lib/queries/assignments";
import { Assignment } from "@/types/assignment";
import { getLearningContentsByIds } from "@/lib/queries/learningContent";
import { LearningContent } from "@/types/learningContent";
import { getQuizzesByIds } from "@/lib/queries/quizzes";
import { Quiz } from "@/types/quiz";
import List from "@/components/ui/List";
import { useAuth } from "@/contexts/AuthContext";
import { getStudentGroupForClass } from "@/lib/queries/groups";
import ContentCard from "@/components/Student/Classes/ContentParts/ContentCard";

interface ContentProps {
  classData: Class;
}

export default function Content({ classData }: ContentProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [studentGroupId, setStudentGroupId] = useState<string | null>(null);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [assignmentById, setAssignmentById] = useState<
    Record<string, Assignment>
  >({});
  const [learningContentById, setLearningContentById] = useState<
    Record<string, LearningContent>
  >({});
  const [quizById, setQuizById] = useState<Record<string, Quiz>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formativeAssignmentIds = useMemo(
    () =>
      items
        .filter((i) => i.type === "formative_assignment")
        .map((i) => i.ref_id),
    [items]
  );

  const learningContentIds = useMemo(
    () =>
      items.filter((i) => i.type === "learning_content").map((i) => i.ref_id),
    [items]
  );

  const quizIds = useMemo(
    () => items.filter((i) => i.type === "quiz").map((i) => i.ref_id),
    [items]
  );

  // Fetch student's group for this class
  useEffect(() => {
    const fetchGroup = async () => {
      if (!user || !classData.id) return;

      try {
        const groupId = await getStudentGroupForClass(classData.id, user.id);
        setStudentGroupId(groupId);
      } catch (err) {
        console.error("Error fetching student group:", err);
        setError("Failed to load your group assignment.");
      }
    };

    fetchGroup();
  }, [user, classData.id]);

  // Fetch content items for student's group
  useEffect(() => {
    const fetchItems = async () => {
      if (!studentGroupId || !classData.id) {
        setItems([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const contentItems = await getContentItemsByGroup({
          classDbId: classData.id,
          classGroupId: studentGroupId,
        });
        setItems(contentItems);
      } catch (err: unknown) {
        const code =
          typeof err === "object" && err !== null
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (err as any).code || (err as any).cause?.code
            : undefined;
        if (code === "42703") {
          setError(
            "Group-scoped content is not installed yet. Run the Supabase group-scoped content migration."
          );
        } else {
          console.error("Error fetching group content items:", err);
          setError("Failed to load content. Please try again.");
        }
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [classData.id, studentGroupId]);

  useEffect(() => {
    const hydrateAssignments = async () => {
      try {
        const data = await getAssignmentsByIdsForTeacher(
          formativeAssignmentIds
        );
        setAssignmentById((prev) => {
          const next = { ...prev };
          for (const a of data) next[a.id] = a;
          return next;
        });
      } catch (err) {
        console.error("Error hydrating assignments for content feed:", err);
      }
    };

    if (formativeAssignmentIds.length > 0) {
      hydrateAssignments();
    }
  }, [formativeAssignmentIds]);

  useEffect(() => {
    const hydrateLearningContent = async () => {
      try {
        const data = await getLearningContentsByIds(learningContentIds);
        setLearningContentById((prev) => {
          const next = { ...prev };
          for (const lc of data) next[lc.id] = lc;
          return next;
        });
      } catch (err) {
        console.error(
          "Error hydrating learning content for content feed:",
          err
        );
      }
    };

    if (learningContentIds.length > 0) {
      hydrateLearningContent();
    }
  }, [learningContentIds]);

  useEffect(() => {
    const hydrateQuizzes = async () => {
      try {
        const data = await getQuizzesByIds(quizIds);
        setQuizById((prev) => {
          const next = { ...prev };
          for (const q of data) next[q.id] = q;
          return next;
        });
      } catch (err) {
        console.error("Error hydrating quizzes for content feed:", err);
      }
    };

    if (quizIds.length > 0) {
      hydrateQuizzes();
    }
  }, [quizIds]);

  const handleOpen = (item: ContentItem) => {
    if (item.type === "formative_assignment") {
      const a = assignmentById[item.ref_id];
      if (a) {
        router.push(
          `/students/classes/${classData.class_id}/assignments/${a.assignment_id}`
        );
        return;
      }
    }

    if (item.type === "learning_content") {
      const lc = learningContentById[item.ref_id];
      if (lc) {
        router.push(
          `/students/classes/${classData.class_id}/learning-content/${lc.learning_content_id}`
        );
      }
    }

    if (item.type === "quiz") {
      const q = quizById[item.ref_id];
      if (q) {
        router.push(
          `/students/classes/${classData.class_id}/quizzes/${q.quiz_id}`
        );
      }
    }
  };

  return (
    <div className="py-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Content</h2>
        {studentGroupId && (
          <p className="text-sm text-muted-foreground mt-1">
            Showing content for your assigned group
          </p>
        )}
      </div>

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
            You haven't been assigned to a group yet.
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
                onOpen={() => handleOpen(item)}
              />
            );
          }}
        />
      )}
    </div>
  );
}

