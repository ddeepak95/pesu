"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Class } from "@/types/class";
import { ContentItem } from "@/types/contentItem";
import {
  getContentItemsByGroup,
  updateContentItemPositions,
  softDeleteContentItem,
  updateContentItem,
} from "@/lib/queries/contentItems";
import { getAssignmentsByIdsForTeacher } from "@/lib/queries/assignments";
import { Assignment } from "@/types/assignment";
import { getLearningContentsByIds } from "@/lib/queries/learningContent";
import { LearningContent } from "@/types/learningContent";
import { getQuizzesByIds } from "@/lib/queries/quizzes";
import { Quiz } from "@/types/quiz";
import { getSurveysByIds } from "@/lib/queries/surveys";
import { Survey } from "@/types/survey";
import List from "@/components/ui/List";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClassGroup, getClassGroups } from "@/lib/queries/groups";
import { CheckSquare, X, Copy, MoreVertical, Trash2 } from "lucide-react";
import DuplicateContentDialog from "@/components/Teacher/Classes/DuplicateContentDialog";
import BulkDuplicateContentDialog from "@/components/Teacher/Classes/BulkDuplicateContentDialog";
import CreateContentMenu from "@/components/Teacher/Classes/ContentParts/CreateContentMenu";
import ContentCard from "@/components/Teacher/Classes/ContentParts/ContentCard";
import { AssignmentLinkShare } from "@/components/Teacher/Assignments/AssignmentLinkShare";

interface ContentProps {
  classData: Class;
}

export default function Content({ classData }: ContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateItem, setDuplicateItem] = useState<ContentItem | null>(null);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [assignmentById, setAssignmentById] = useState<
    Record<string, Assignment>
  >({});
  const [learningContentById, setLearningContentById] = useState<
    Record<string, LearningContent>
  >({});
  const [quizById, setQuizById] = useState<Record<string, Quiz>>({});
  const [surveyById, setSurveyById] = useState<Record<string, Survey>>({});
  const [loading, setLoading] = useState(true);
  const [savingOrder, setSavingOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] =
    useState<Assignment | null>(null);

  // Bulk selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"duplicate" | "delete" | null>(null);
  const [bulkDuplicateOpen, setBulkDuplicateOpen] = useState(false);

  const selectedItems = useMemo(
    () => items.filter((i) => selectedIds.has(i.id)),
    [items, selectedIds]
  );

  const toggleSelectItem = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setBulkAction(null);
  }, []);

  const setGroupIdInUrl = (groupId: string) => {
    // Maintain param order: tab first, then groupId, then everything else.
    const current = new URLSearchParams(searchParams.toString());
    current.delete("tab");
    current.delete("groupId");

    const ordered = new URLSearchParams();
    ordered.set("tab", "content");
    ordered.set("groupId", groupId);

    for (const [k, v] of current.entries()) {
      ordered.append(k, v);
    }

    router.replace(`?${ordered.toString()}`);
  };

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

  const surveyIds = useMemo(
    () => items.filter((i) => i.type === "survey").map((i) => i.ref_id),
    [items]
  );

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      setError(null);

      try {
        const classGroups = await getClassGroups(classData.id);
        setGroups(classGroups);
        const fromUrl = searchParams.get("groupId");
        const isValidFromUrl = fromUrl
          ? classGroups.some((g) => g.id === fromUrl)
          : false;
        const initialGroupId = isValidFromUrl
          ? fromUrl
          : classGroups[0]?.id ?? null;
        setSelectedGroupId(initialGroupId);
        if (initialGroupId) {
          setGroupIdInUrl(initialGroupId);
        }
      } catch (err: unknown) {
        // If migrations haven't been applied yet, avoid hard-breaking the page.
        const code =
          typeof err === "object" && err !== null
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (err as any).code || (err as any).cause?.code
            : undefined;
        if (code === "42P01") {
          setError(
            "Content/groups tables are not installed yet. Run the Supabase migrations to enable groups + the Content feed."
          );
          setItems([]);
          setGroups([]);
        } else {
          console.error("Error fetching content items:", err);
          setError("Failed to load content. Please try again.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classData.id]);

  useEffect(() => {
    const fetchItems = async () => {
      if (!selectedGroupId) {
        setItems([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const contentItems = await getContentItemsByGroup({
          classDbId: classData.id,
          classGroupId: selectedGroupId,
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
  }, [classData.id, selectedGroupId]);

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

  useEffect(() => {
    const hydrateSurveys = async () => {
      try {
        const data = await getSurveysByIds(surveyIds);
        setSurveyById((prev) => {
          const next = { ...prev };
          for (const s of data) next[s.id] = s;
          return next;
        });
      } catch (err) {
        console.error("Error hydrating surveys for content feed:", err);
      }
    };

    if (surveyIds.length > 0) {
      hydrateSurveys();
    }
  }, [surveyIds]);

  const handleMove = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const current = items[index];
    const target = items[targetIndex];
    if (!current || !target) return;

    // Swap the *stored* position values. Writing array indices can create duplicate positions
    // and cause unstable sorting on refresh.
    const positions = [
      { id: current.id, position: target.position },
      { id: target.id, position: current.position },
    ];

    // Optimistic update: swap in UI + swap their position values
    const next = [...items];
    next[index] = { ...target, position: current.position };
    next[targetIndex] = { ...current, position: target.position };
    setItems(next);
    setSavingOrder(true);
    try {
      await updateContentItemPositions(positions);
    } catch (err) {
      console.error("Error updating content item positions:", err);
      alert("Failed to update order. Please try again.");
      // best-effort refetch on failure
      try {
        if (selectedGroupId) {
          const fresh = await getContentItemsByGroup({
            classDbId: classData.id,
            classGroupId: selectedGroupId,
          });
          setItems(fresh);
        }
      } catch {}
    } finally {
      setSavingOrder(false);
    }
  };

  const handleOpen = (item: ContentItem) => {
    const backQs = selectedGroupId
      ? `?tab=content&groupId=${selectedGroupId}`
      : `?tab=content`;

    if (item.type === "formative_assignment") {
      const a = assignmentById[item.ref_id];
      if (a) {
        router.push(
          `/teacher/classes/${classData.class_id}/assignments/${a.assignment_id}${backQs}`
        );
        return;
      }
    }

    if (item.type === "learning_content") {
      const lc = learningContentById[item.ref_id];
      if (lc) {
        router.push(
          `/teacher/classes/${classData.class_id}/learning-content/${lc.learning_content_id}${backQs}`
        );
      }
    }

    if (item.type === "quiz") {
      const q = quizById[item.ref_id];
      if (q) {
        router.push(
          `/teacher/classes/${classData.class_id}/quizzes/${q.quiz_id}${backQs}`
        );
      }
    }

    if (item.type === "survey") {
      const s = surveyById[item.ref_id];
      if (s) {
        router.push(
          `/teacher/classes/${classData.class_id}/surveys/${s.survey_id}${backQs}`
        );
      }
    }
  };

  const openDuplicate = (item: ContentItem) => {
    setDuplicateItem(item);
    setDuplicateOpen(true);
  };

  const handleEdit = (item: ContentItem) => {
    const backQs = selectedGroupId
      ? `?tab=content&groupId=${selectedGroupId}`
      : `?tab=content`;

    if (item.type === "formative_assignment") {
      const a = assignmentById[item.ref_id];
      if (a) {
        router.push(
          `/teacher/classes/${classData.class_id}/assignments/${a.assignment_id}/edit${backQs}`
        );
        return;
      }
    }

    if (item.type === "learning_content") {
      const lc = learningContentById[item.ref_id];
      if (lc) {
        router.push(
          `/teacher/classes/${classData.class_id}/learning-content/${lc.learning_content_id}/edit${backQs}`
        );
      }
    }

    if (item.type === "quiz") {
      const q = quizById[item.ref_id];
      if (q) {
        router.push(
          `/teacher/classes/${classData.class_id}/quizzes/${q.quiz_id}/edit${backQs}`
        );
      }
    }

    if (item.type === "survey") {
      const s = surveyById[item.ref_id];
      if (s) {
        router.push(
          `/teacher/classes/${classData.class_id}/surveys/${s.survey_id}/edit${backQs}`
        );
      }
    }
  };

  const handleDelete = async (item: ContentItem) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this item? This action cannot be undone."
    );
    if (!confirmed) return;

    try {
      await softDeleteContentItem(item.id);
      // Optimistically remove from UI
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      console.error("Error deleting content item:", err);
      alert("Failed to delete item. Please try again.");
    }
  };

  const handleBulkDelete = async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    const confirmed = window.confirm(
      `Are you sure you want to delete ${count} item(s)? This action cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) => softDeleteContentItem(id))
      );
      setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
      exitSelectionMode();
    } catch (err) {
      console.error("Error bulk deleting content items:", err);
      alert("Failed to delete some items. Please try again.");
    }
  };

  const handleShareLinks = (item: ContentItem) => {
    if (item.type === "formative_assignment") {
      const assignment = assignmentById[item.ref_id];
      if (assignment) {
        setSelectedAssignment(assignment);
        setShareDialogOpen(true);
      }
    }
  };

  const handleToggleLockAfterComplete = async (
    itemId: string,
    lockAfterComplete: boolean
  ) => {
    try {
      await updateContentItem(itemId, {
        lock_after_complete: lockAfterComplete,
      });
      // Update local state
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? { ...item, lock_after_complete: lockAfterComplete }
            : item
        )
      );
    } catch (err) {
      console.error("Error updating lock_after_complete:", err);
      alert("Failed to update lock setting. Please try again.");
    }
  };

  return (
    <div className="py-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Content</h2>

        <div className="flex items-center gap-2">
          <CreateContentMenu
            classPublicId={classData.class_id}
            selectedGroupId={selectedGroupId}
          />
        </div>
      </div>

      {selectionMode && (
        <div className="flex items-center gap-3 mb-4 p-3 rounded-lg border bg-muted/50">
          <span className="text-sm font-medium">
            {selectedIds.size} of {items.length} selected
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (selectedIds.size === items.length) {
                setSelectedIds(new Set());
              } else {
                setSelectedIds(new Set(items.map((i) => i.id)));
              }
            }}
          >
            {selectedIds.size === items.length ? "Deselect All" : "Select All"}
          </Button>
          {bulkAction === "duplicate" && (
            <Button
              size="sm"
              disabled={selectedIds.size === 0}
              onClick={() => setBulkDuplicateOpen(true)}
            >
              <Copy className="h-4 w-4 mr-2" />
              Duplicate to...
            </Button>
          )}
          {bulkAction === "delete" && (
            <Button
              variant="destructive"
              size="sm"
              disabled={selectedIds.size === 0}
              onClick={handleBulkDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete selected
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={exitSelectionMode}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
        </div>
      )}

      <Tabs
        value={selectedGroupId ?? ""}
        onValueChange={(v) => {
          setSelectedGroupId(v);
          setGroupIdInUrl(v);
          exitSelectionMode();
        }}
        className="w-full"
      >
        <div className="flex items-center justify-between">
          <TabsList>
            {groups.map((g) => (
              <TabsTrigger key={g.id} value={g.id}>
                {g.name || `Group ${g.group_index + 1}`}
              </TabsTrigger>
            ))}
          </TabsList>
          {!selectionMode && items.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => { setBulkAction("duplicate"); setSelectionMode(true); }}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicate items
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setBulkAction("delete"); setSelectionMode(true); }}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete items
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {groups.map((g) => (
          <TabsContent key={g.id} value={g.id} className="pt-4">
            {loading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Loading content…</p>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-destructive">{error}</p>
              </div>
            ) : (
              <List
                items={items}
                keyExtractor={(item) => item.id}
                emptyMessage="No content yet. Use the Create button to add a quiz, survey, learning content, or formative assignment."
                renderItem={(item, index) => {
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

                  const language =
                    item.type === "formative_assignment"
                      ? assignmentById[item.ref_id]?.preferred_language
                      : undefined;

                  return (
                    <ContentCard
                      item={item}
                      index={index}
                      total={items.length}
                      title={resolvedTitle}
                      titleLoading={titleLoading}
                      savingOrder={savingOrder}
                      assessmentMode={assessmentMode}
                      language={language}
                      selectionMode={selectionMode}
                      selected={selectedIds.has(item.id)}
                      onToggleSelect={() => toggleSelectItem(item.id)}
                      onOpen={() => handleOpen(item)}
                      onEdit={() => handleEdit(item)}
                      onDuplicate={() => openDuplicate(item)}
                      onDelete={() => handleDelete(item)}
                      onMove={(direction) => handleMove(index, direction)}
                      onShareLinks={() => handleShareLinks(item)}
                      onToggleLockAfterComplete={handleToggleLockAfterComplete}
                    />
                  );
                }}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>

      <DuplicateContentDialog
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        item={duplicateItem}
        onDuplicated={async () => {
          if (!selectedGroupId) return;
          try {
            const fresh = await getContentItemsByGroup({
              classDbId: classData.id,
              classGroupId: selectedGroupId,
            });
            setItems(fresh);
          } catch {}
        }}
      />

      <BulkDuplicateContentDialog
        open={bulkDuplicateOpen}
        onOpenChange={setBulkDuplicateOpen}
        items={selectedItems}
        classDbId={classData.id}
        groups={groups}
        sourceGroupId={selectedGroupId}
        onDuplicated={() => {
          exitSelectionMode();
        }}
      />

      {selectedAssignment && (
        <AssignmentLinkShare
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
          assignmentId={selectedAssignment.assignment_id}
          classId={classData.class_id}
          isPublic={selectedAssignment.is_public}
        />
      )}
    </div>
  );
}
